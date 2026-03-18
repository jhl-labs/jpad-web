import { NextRequest } from "next/server";
import { z } from "zod";
import { recordAuditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  getScimBaseUrl,
  requireScimAuth,
  SCIM_CONTENT_TYPE,
  SCIM_PATCH_OP_SCHEMA,
  scimError,
  scimPatchSchema,
  scimJson,
  ScimHttpError,
} from "@/lib/scim";
import {
  assertScimGroupUniqueness,
  buildScimGroupResource,
  createScimSystemAuditActor,
  findWorkspaceIdsForScimGroups,
  normalizeScimGroupExternalId,
  resolveScimIdentityIdsForGroup,
  scimGroupWithMembersInclude,
  syncWorkspaceScimAccessForWorkspaces,
  updateScimGroupMembers,
} from "@/lib/scimGroups";
import { rateLimitRedis } from "@/lib/rateLimit";

const partialGroupPatchSchema = z
  .object({
    displayName: z.string().min(1).max(255).optional(),
    externalId: z.string().max(255).nullable().optional(),
    members: z
      .array(
        z
          .object({
            value: z.string().min(1).max(255),
          })
          .passthrough()
      )
      .max(1000)
      .optional(),
  })
  .passthrough();

interface GroupPatchState {
  displayName: string;
  externalId: string | null;
  memberIds: string[];
}

function toNullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizePatchMembers(value: unknown): string[] {
  if (Array.isArray(value)) {
    const parsed = partialGroupPatchSchema.shape.members.safeParse(value);
    if (!parsed.success || !parsed.data) {
      throw new ScimHttpError(400, "Invalid SCIM group members payload", "invalidValue");
    }
    return parsed.data.map((member) => member.value.trim()).filter(Boolean);
  }

  if (value && typeof value === "object") {
    return normalizePatchMembers([value]);
  }

  throw new ScimHttpError(400, "Invalid SCIM group members value", "invalidValue");
}

function applyPathlessGroupPatchValue(state: GroupPatchState, value: unknown) {
  const parsed = partialGroupPatchSchema.safeParse(value);
  if (!parsed.success) {
    throw new ScimHttpError(400, "Invalid SCIM group patch payload", "invalidValue");
  }

  if (typeof parsed.data.displayName === "string") {
    state.displayName = parsed.data.displayName.trim();
  }
  if ("externalId" in parsed.data) {
    state.externalId = normalizeScimGroupExternalId(parsed.data.externalId ?? null);
  }
  if (parsed.data.members) {
    state.memberIds = parsed.data.members.map((member) => member.value.trim()).filter(Boolean);
  }
}

function applyGroupPatchOperation(
  state: GroupPatchState,
  operation: { op: string; path?: string; value?: unknown }
) {
  const op = operation.op.trim().toLowerCase();
  if (!["add", "replace", "remove"].includes(op)) {
    throw new ScimHttpError(400, `Unsupported SCIM patch op: ${operation.op}`, "invalidSyntax");
  }

  if (!operation.path) {
    if (op === "remove") {
      throw new ScimHttpError(400, "SCIM remove requires a path", "invalidPath");
    }
    applyPathlessGroupPatchValue(state, operation.value);
    return;
  }

  const path = operation.path.trim();
  const normalizedPath = path.toLowerCase();

  if (normalizedPath === "displayname") {
    if (op === "remove") {
      throw new ScimHttpError(400, "SCIM displayName cannot be removed", "mutability");
    }
    const displayName = toNullableString(operation.value);
    if (!displayName) {
      throw new ScimHttpError(400, "SCIM displayName must be a string", "invalidValue");
    }
    state.displayName = displayName;
    return;
  }

  if (normalizedPath === "externalid") {
    state.externalId = op === "remove" ? null : normalizeScimGroupExternalId(operation.value as string | null);
    return;
  }

  if (normalizedPath === "members") {
    if (op === "remove") {
      state.memberIds = [];
      return;
    }

    const nextMemberIds = normalizePatchMembers(operation.value);
    if (op === "replace") {
      state.memberIds = nextMemberIds;
      return;
    }

    state.memberIds = [...new Set([...state.memberIds, ...nextMemberIds])];
    return;
  }

  const memberMatch = normalizedPath.match(/^members\[value eq "([^"]+)"\]$/);
  if (memberMatch) {
    const memberId = memberMatch[1];
    if (op === "remove") {
      state.memberIds = state.memberIds.filter((id) => id !== memberId);
      return;
    }
    state.memberIds = [...new Set([...state.memberIds, memberId])];
    return;
  }

  throw new ScimHttpError(400, `Unsupported SCIM patch path: ${path}`, "invalidPath");
}

async function loadScimGroup(organizationId: string, groupId: string) {
  return prisma.organizationScimGroup.findFirst({
    where: {
      id: groupId,
      organizationId,
    },
    ...scimGroupWithMembersInclude,
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const auth = await requireScimAuth(req);
    const { groupId } = await params;
    const group = await loadScimGroup(auth.organizationId, groupId);

    if (!group) {
      return scimError("SCIM group not found", 404);
    }

    return scimJson(buildScimGroupResource(group, getScimBaseUrl(req)));
  } catch (error) {
    if (error instanceof ScimHttpError) {
      return scimError(error.message, error.status, error.scimType, error.headers);
    }

    logError("scim.group.fetch_failed", error, {}, req);
    return scimError("Failed to read SCIM group", 500);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const auth = await requireScimAuth(req);
    const actor = createScimSystemAuditActor(auth);
    const { groupId } = await params;

    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      logError("scim.group.patch_json_parse_failed", error);
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

    const existingGroup = await loadScimGroup(auth.organizationId, groupId);
    if (!existingGroup) {
      return scimError("SCIM group not found", 404);
    }

    const patchState: GroupPatchState = {
      displayName: existingGroup.displayName,
      externalId: existingGroup.externalId,
      memberIds: existingGroup.members.map((member) => member.scimIdentityId),
    };

    for (const operation of parsed.data.Operations) {
      applyGroupPatchOperation(patchState, operation);
    }

    const affectedWorkspaceIds = await findWorkspaceIdsForScimGroups([existingGroup.id]);
    const updatedGroup = await prisma.$transaction(async (tx) => {
      const normalizedExternalId = normalizeScimGroupExternalId(patchState.externalId);
      await assertScimGroupUniqueness(tx, {
        organizationId: auth.organizationId,
        displayName: patchState.displayName,
        externalId: normalizedExternalId,
        excludeGroupId: existingGroup.id,
      });

      const resolvedMemberIds = await resolveScimIdentityIdsForGroup(
        tx,
        auth.organizationId,
        patchState.memberIds
      );

      await tx.organizationScimGroup.update({
        where: { id: existingGroup.id },
        data: {
          displayName: patchState.displayName,
          externalId: normalizedExternalId,
          lastProvisionedAt: new Date(),
        },
      });

      await updateScimGroupMembers(tx, existingGroup.id, resolvedMemberIds);

      return tx.organizationScimGroup.findUniqueOrThrow({
        where: { id: existingGroup.id },
        ...scimGroupWithMembersInclude,
      });
    });

    await recordAuditLog({
      action: "organization.scim.group.updated",
      actor,
      targetId: updatedGroup.id,
      targetType: "organization_scim_group",
      metadata: {
        organizationId: auth.organizationId,
        scimTokenId: auth.tokenId,
        displayName: updatedGroup.displayName,
        externalId: updatedGroup.externalId,
        memberCount: updatedGroup.members.length,
      },
      context: auth.requestContext,
    });

    await syncWorkspaceScimAccessForWorkspaces(affectedWorkspaceIds, {
      actor,
      context: auth.requestContext,
      trigger: "scim.group.updated",
      organizationId: auth.organizationId,
      sourceGroupIds: [existingGroup.id],
    });

    return scimJson(buildScimGroupResource(updatedGroup, getScimBaseUrl(req)));
  } catch (error) {
    if (error instanceof ScimHttpError) {
      return scimError(error.message, error.status, error.scimType, error.headers);
    }

    logError("scim.group.patch_failed", error, {}, req);
    return scimError("Failed to update SCIM group", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    const auth = await requireScimAuth(req);
    const actor = createScimSystemAuditActor(auth);
    const { groupId } = await params;

    if (!(await rateLimitRedis(`scim:delete:${auth.tokenId}`, 30, 60_000))) {
      return scimError("Rate limit exceeded", 429);
    }

    const existingGroup = await loadScimGroup(auth.organizationId, groupId);

    if (!existingGroup) {
      return new Response(null, {
        status: 204,
        headers: {
          "Content-Type": SCIM_CONTENT_TYPE,
        },
      });
    }

    const affectedWorkspaceIds = await findWorkspaceIdsForScimGroups([existingGroup.id]);

    await prisma.organizationScimGroup.delete({
      where: { id: existingGroup.id },
    });

    await recordAuditLog({
      action: "organization.scim.group.deleted",
      actor,
      targetId: existingGroup.id,
      targetType: "organization_scim_group",
      metadata: {
        organizationId: auth.organizationId,
        scimTokenId: auth.tokenId,
        displayName: existingGroup.displayName,
      },
      context: auth.requestContext,
    });

    await syncWorkspaceScimAccessForWorkspaces(affectedWorkspaceIds, {
      actor,
      context: auth.requestContext,
      trigger: "scim.group.deleted",
      organizationId: auth.organizationId,
      sourceGroupIds: [existingGroup.id],
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

    logError("scim.group.delete_failed", error, {}, req);
    return scimError("Failed to delete SCIM group", 500);
  }
}
