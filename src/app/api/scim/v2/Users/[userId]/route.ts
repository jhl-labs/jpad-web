import { NextRequest } from "next/server";
import { z } from "zod";
import { recordAuditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  buildScimUserResource,
  extractScimEmail,
  getScimBaseUrl,
  normalizeScimUserName,
  requireScimAuth,
  SCIM_CONTENT_TYPE,
  SCIM_PATCH_OP_SCHEMA,
  scimCreateUserSchema,
  scimError,
  scimPatchSchema,
  scimJson,
  ScimHttpError,
  syncScimOrganizationMembership,
} from "@/lib/scim";
import {
  assertScimIdentityUniqueness,
  findSingleUserByEmail,
  normalizeScimCreateUserInput,
  scimIdentityWithUserInclude,
} from "@/lib/scimProvisioning";
import { rateLimitRedis } from "@/lib/rateLimit";
import {
  createScimSystemAuditActor,
  findWorkspaceIdsForScimIdentity,
  syncWorkspaceScimAccessForWorkspaces,
} from "@/lib/scimGroups";

const partialPatchValueSchema = z
  .object({
    userName: z.string().min(1).max(320).optional(),
    externalId: z.string().max(255).nullable().optional(),
    active: z.boolean().optional(),
    displayName: z.string().max(255).nullable().optional(),
    name: z
      .object({
        givenName: z.string().max(255).nullable().optional(),
        familyName: z.string().max(255).nullable().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    emails: z
      .array(
        z
          .object({
            value: z.string().min(1).max(320),
            primary: z.boolean().optional(),
            type: z.string().max(50).optional(),
          })
          .passthrough()
      )
      .max(10)
      .optional(),
  })
  .passthrough();

interface PatchState {
  userName: string;
  externalId: string | null;
  active: boolean;
  displayName: string | null;
  givenName: string | null;
  familyName: string | null;
  email: string | null;
}

function toNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function extractPatchEmail(value: unknown, userName: string): string | null {
  if (typeof value === "string") {
    return extractScimEmail({
      userName,
      emails: [{ value, primary: true }],
    });
  }

  if (Array.isArray(value)) {
    const parsed = scimCreateUserSchema.shape.emails.safeParse(value);
    if (!parsed.success) {
      throw new ScimHttpError(400, "Invalid SCIM emails payload", "invalidValue");
    }

    return extractScimEmail({
      userName,
      emails: parsed.data,
    });
  }

  if (value && typeof value === "object") {
    return extractPatchEmail([value], userName);
  }

  throw new ScimHttpError(400, "Invalid SCIM email value", "invalidValue");
}

function applyPathlessPatchValue(state: PatchState, value: unknown) {
  const parsed = partialPatchValueSchema.safeParse(value);
  if (!parsed.success) {
    throw new ScimHttpError(400, "Invalid SCIM patch payload", "invalidValue");
  }

  if (typeof parsed.data.userName === "string") {
    state.userName = normalizeScimUserName(parsed.data.userName);
  }
  if ("externalId" in parsed.data) {
    state.externalId = toNullableString(parsed.data.externalId ?? null);
  }
  if (typeof parsed.data.active === "boolean") {
    state.active = parsed.data.active;
  }
  if ("displayName" in parsed.data) {
    state.displayName = toNullableString(parsed.data.displayName ?? null);
  }
  if (parsed.data.name) {
    if ("givenName" in parsed.data.name) {
      state.givenName = toNullableString(parsed.data.name.givenName ?? null);
    }
    if ("familyName" in parsed.data.name) {
      state.familyName = toNullableString(parsed.data.name.familyName ?? null);
    }
  }
  if (parsed.data.emails) {
    state.email = extractPatchEmail(parsed.data.emails, state.userName);
  }
}

function applyPatchOperation(state: PatchState, operation: { op: string; path?: string; value?: unknown }) {
  const op = operation.op.trim().toLowerCase();
  if (!["add", "replace", "remove"].includes(op)) {
    throw new ScimHttpError(400, `Unsupported SCIM patch op: ${operation.op}`, "invalidSyntax");
  }

  if (!operation.path) {
    if (op === "remove") {
      throw new ScimHttpError(400, "SCIM remove requires a path", "invalidPath");
    }
    applyPathlessPatchValue(state, operation.value);
    return;
  }

  const path = operation.path.trim();
  const normalizedPath = path.toLowerCase();

  if (normalizedPath === "active") {
    if (op === "remove" || typeof operation.value !== "boolean") {
      throw new ScimHttpError(400, "SCIM active patch requires a boolean value", "invalidValue");
    }
    state.active = operation.value;
    return;
  }

  if (normalizedPath === "username") {
    if (op === "remove") {
      throw new ScimHttpError(400, "SCIM userName cannot be removed", "mutability");
    }
    const userName = toNullableString(operation.value);
    if (!userName) {
      throw new ScimHttpError(400, "SCIM userName must be a string", "invalidValue");
    }
    state.userName = normalizeScimUserName(userName);
    return;
  }

  if (normalizedPath === "externalid") {
    state.externalId = op === "remove" ? null : toNullableString(operation.value);
    return;
  }

  if (normalizedPath === "displayname") {
    state.displayName = op === "remove" ? null : toNullableString(operation.value);
    return;
  }

  if (normalizedPath === "name") {
    if (op === "remove") {
      state.givenName = null;
      state.familyName = null;
      return;
    }
    const parsed = partialPatchValueSchema.shape.name.safeParse(operation.value);
    if (!parsed.success || !parsed.data) {
      throw new ScimHttpError(400, "Invalid SCIM name patch", "invalidValue");
    }
    if ("givenName" in parsed.data) {
      state.givenName = toNullableString(parsed.data.givenName ?? null);
    }
    if ("familyName" in parsed.data) {
      state.familyName = toNullableString(parsed.data.familyName ?? null);
    }
    return;
  }

  if (normalizedPath === "name.givenname") {
    state.givenName = op === "remove" ? null : toNullableString(operation.value);
    return;
  }

  if (normalizedPath === "name.familyname") {
    state.familyName = op === "remove" ? null : toNullableString(operation.value);
    return;
  }

  if (normalizedPath === "emails") {
    if (op === "remove") {
      state.email = extractScimEmail({ userName: state.userName });
      return;
    }
    state.email = extractPatchEmail(operation.value, state.userName);
    return;
  }

  if (
    normalizedPath === "emails.value" ||
    normalizedPath === 'emails[type eq "work"].value'
  ) {
    if (op === "remove") {
      state.email = extractScimEmail({ userName: state.userName });
      return;
    }
    state.email = extractPatchEmail(operation.value, state.userName);
    return;
  }

  throw new ScimHttpError(400, `Unsupported SCIM patch path: ${path}`, "invalidPath");
}

async function loadScimIdentity(organizationId: string, userId: string) {
  return prisma.organizationScimIdentity.findFirst({
    where: {
      id: userId,
      organizationId,
    },
    ...scimIdentityWithUserInclude,
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await requireScimAuth(req);
    const { userId } = await params;
    const identity = await loadScimIdentity(auth.organizationId, userId);

    if (!identity) {
      return scimError("SCIM user not found", 404);
    }

    return scimJson(buildScimUserResource(identity, getScimBaseUrl(req)));
  } catch (error) {
    if (error instanceof ScimHttpError) {
      return scimError(error.message, error.status, error.scimType, error.headers);
    }

    logError("scim.user.fetch_failed", error, {}, req);
    return scimError("Failed to read SCIM user", 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await requireScimAuth(req);
    const { userId } = await params;

    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      logError("scim.user.patch_json_parse_failed", error);
      return scimError("Invalid SCIM JSON payload", 400, "invalidSyntax");
    }

    const parsed = scimPatchSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Invalid SCIM patch payload";
      return scimError(firstError, 400, "invalidValue");
    }

    if (!parsed.data.schemas.includes(SCIM_PATCH_OP_SCHEMA)) {
      return scimError("Unsupported SCIM patch schema", 400, "invalidSyntax");
    }

    const existingIdentity = await loadScimIdentity(auth.organizationId, userId);
    if (!existingIdentity) {
      return scimError("SCIM user not found", 404);
    }
    const actor = createScimSystemAuditActor(auth);

    const patchState: PatchState = {
      userName: existingIdentity.userName,
      externalId: existingIdentity.externalId,
      active: existingIdentity.active,
      displayName: existingIdentity.displayName,
      givenName: existingIdentity.givenName,
      familyName: existingIdentity.familyName,
      email: existingIdentity.user.email,
    };

    for (const operation of parsed.data.Operations) {
      applyPatchOperation(patchState, operation);
    }

    const normalized = normalizeScimCreateUserInput({
      userName: patchState.userName,
      externalId: patchState.externalId ?? undefined,
      active: patchState.active,
      displayName: patchState.displayName ?? undefined,
      name: {
        givenName: patchState.givenName ?? undefined,
        familyName: patchState.familyName ?? undefined,
      },
      emails: patchState.email
        ? [{ value: patchState.email, primary: true, type: "work" }]
        : undefined,
    });

    const updatedIdentity = await prisma.$transaction(async (tx) => {
      const matchedUser = await findSingleUserByEmail(tx, normalized.email);
      if (matchedUser && matchedUser.id !== existingIdentity.userId) {
        throw new ScimHttpError(
          409,
          "Another user already owns this email address",
          "uniqueness"
        );
      }

      await assertScimIdentityUniqueness(tx, {
        organizationId: auth.organizationId,
        userName: normalized.userName,
        externalId: normalized.externalId,
        userId: existingIdentity.userId,
        excludeIdentityId: existingIdentity.id,
      });

      await tx.user.update({
        where: { id: existingIdentity.userId },
        data: {
          email: normalized.email,
          name: normalized.resolvedName,
        },
      });

      await tx.organizationScimIdentity.update({
        where: { id: existingIdentity.id },
        data: {
          externalId: normalized.externalId,
          userName: normalized.userName,
          displayName: normalized.displayName,
          givenName: normalized.givenName,
          familyName: normalized.familyName,
          active: normalized.active,
          lastProvisionedAt: new Date(),
        },
      });

      await syncScimOrganizationMembership(
        tx,
        auth.organizationId,
        existingIdentity.userId,
        normalized.active
      );

      return tx.organizationScimIdentity.findUniqueOrThrow({
        where: { id: existingIdentity.id },
        ...scimIdentityWithUserInclude,
      });
    });
    const affectedWorkspaceIds = await findWorkspaceIdsForScimIdentity(existingIdentity.id);

    const action =
      existingIdentity.active && !updatedIdentity.active
        ? "organization.scim.user.deprovisioned"
        : !existingIdentity.active && updatedIdentity.active
          ? "organization.scim.user.reactivated"
          : "organization.scim.user.updated";

    await recordAuditLog({
      action,
      actor,
      targetId: updatedIdentity.id,
      targetType: "organization_scim_identity",
      metadata: {
        organizationId: auth.organizationId,
        scimTokenId: auth.tokenId,
        provisionedUserId: updatedIdentity.user.id,
        userName: updatedIdentity.userName,
        externalId: updatedIdentity.externalId,
        active: updatedIdentity.active,
      },
      context: auth.requestContext,
    });

    await syncWorkspaceScimAccessForWorkspaces(affectedWorkspaceIds, {
      actor,
      context: auth.requestContext,
      trigger: action,
      organizationId: auth.organizationId,
    });

    return scimJson(buildScimUserResource(updatedIdentity, getScimBaseUrl(req)));
  } catch (error) {
    if (error instanceof ScimHttpError) {
      return scimError(error.message, error.status, error.scimType, error.headers);
    }

    logError("scim.user.patch_failed", error, {}, req);
    return scimError("Failed to update SCIM user", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const auth = await requireScimAuth(req);
    const { userId } = await params;

    if (!(await rateLimitRedis(`scim:delete:${auth.tokenId}`, 30, 60_000))) {
      return scimError("Rate limit exceeded", 429);
    }

    const existingIdentity = await loadScimIdentity(auth.organizationId, userId);

    if (!existingIdentity) {
      return new Response(null, {
        status: 204,
        headers: {
          "Content-Type": SCIM_CONTENT_TYPE,
        },
      });
    }
    const actor = createScimSystemAuditActor(auth);
    const affectedWorkspaceIds = await findWorkspaceIdsForScimIdentity(existingIdentity.id);

    await prisma.$transaction(async (tx) => {
      await syncScimOrganizationMembership(
        tx,
        auth.organizationId,
        existingIdentity.userId,
        false
      );

      await tx.organizationScimIdentity.update({
        where: { id: existingIdentity.id },
        data: {
          active: false,
          lastProvisionedAt: new Date(),
        },
      });
    });

    await recordAuditLog({
      action: "organization.scim.user.deprovisioned",
      actor,
      targetId: existingIdentity.id,
      targetType: "organization_scim_identity",
      metadata: {
        organizationId: auth.organizationId,
        scimTokenId: auth.tokenId,
        provisionedUserId: existingIdentity.user.id,
        userName: existingIdentity.userName,
      },
      context: auth.requestContext,
    });

    await syncWorkspaceScimAccessForWorkspaces(affectedWorkspaceIds, {
      actor,
      context: auth.requestContext,
      trigger: "organization.scim.user.deprovisioned",
      organizationId: auth.organizationId,
    });

    return new Response(null, {
      status: 204,
      headers: {
        "Content-Type": SCIM_CONTENT_TYPE,
      },
    });
  } catch (error) {
    if (error instanceof ScimHttpError) {
      return scimError(error.message, error.status, error.scimType, error.headers);
    }

    logError("scim.user.delete_failed", error, {}, req);
    return scimError("Failed to deprovision SCIM user", 500);
  }
}
