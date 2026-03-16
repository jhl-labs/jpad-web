import { NextRequest } from "next/server";
import { recordAuditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  buildScimIdentityWhereInput,
  buildScimListResponse,
  buildScimUserResource,
  getScimBaseUrl,
  parseScimFilter,
  requireScimAuth,
  SCIM_CORE_USER_SCHEMA,
  scimCreateUserSchema,
  scimError,
  scimJson,
  ScimHttpError,
  syncScimOrganizationMembership,
} from "@/lib/scim";
import {
  createScimSystemAuditActor,
  findWorkspaceIdsForScimIdentity,
  syncWorkspaceScimAccessForWorkspaces,
} from "@/lib/scimGroups";
import {
  assertScimIdentityUniqueness,
  findSingleUserByEmail,
  normalizeScimCreateUserInput,
  scimIdentityWithUserInclude,
} from "@/lib/scimProvisioning";

function parsePositiveInt(value: string | null, defaultValue: number, max: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return defaultValue;
  return Math.min(parsed, max);
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireScimAuth(req);
    const startIndex = parsePositiveInt(req.nextUrl.searchParams.get("startIndex"), 1, 10_000);
    const count = parsePositiveInt(req.nextUrl.searchParams.get("count"), 100, 200);
    const filter = parseScimFilter(req.nextUrl.searchParams.get("filter"), [
      "id",
      "externalId",
      "userName",
    ]);
    const where = buildScimIdentityWhereInput(auth.organizationId, filter);
    const baseUrl = getScimBaseUrl(req);

    const [identities, totalResults] = await Promise.all([
      prisma.organizationScimIdentity.findMany({
        where,
        ...scimIdentityWithUserInclude,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: startIndex - 1,
        take: count,
      }),
      prisma.organizationScimIdentity.count({ where }),
    ]);

    return scimJson(
      buildScimListResponse(
        identities.map((identity) => buildScimUserResource(identity, baseUrl)),
        totalResults,
        startIndex,
        identities.length
      )
    );
  } catch (error) {
    if (error instanceof ScimHttpError) {
      return scimError(error.message, error.status, error.scimType, error.headers);
    }

    logError("scim.users.list_failed", error, {}, req);
    return scimError("Failed to list SCIM users", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireScimAuth(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch (error) {
      logError("scim.users.create_json_parse_failed", error);
      return scimError("Invalid SCIM JSON payload", 400, "invalidSyntax");
    }

    const parsed = scimCreateUserSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Invalid SCIM user payload";
      return scimError(firstError, 400, "invalidValue");
    }

    if (
      parsed.data.schemas &&
      !parsed.data.schemas.includes(SCIM_CORE_USER_SCHEMA)
    ) {
      return scimError("Unsupported SCIM schema for User resource", 400, "invalidSyntax");
    }

    const normalized = normalizeScimCreateUserInput(parsed.data);
    const identity = await prisma.$transaction(async (tx) => {
      const matchedUser = await findSingleUserByEmail(tx, normalized.email);

      await assertScimIdentityUniqueness(tx, {
        organizationId: auth.organizationId,
        userName: normalized.userName,
        externalId: normalized.externalId,
        userId: matchedUser?.id || null,
      });

      const user = matchedUser
        ? await tx.user.update({
            where: { id: matchedUser.id },
            data: {
              email: normalized.email,
              name: normalized.resolvedName,
            },
            select: {
              id: true,
              email: true,
              name: true,
            },
          })
        : await tx.user.create({
            data: {
              email: normalized.email,
              name: normalized.resolvedName,
              hashedPassword: null,
            },
            select: {
              id: true,
              email: true,
              name: true,
            },
          });

      const createdIdentity = await tx.organizationScimIdentity.create({
        data: {
          organizationId: auth.organizationId,
          userId: user.id,
          externalId: normalized.externalId,
          userName: normalized.userName,
          displayName: normalized.displayName,
          givenName: normalized.givenName,
          familyName: normalized.familyName,
          active: normalized.active,
          lastProvisionedAt: new Date(),
        },
        select: {
          id: true,
        },
      });

      await syncScimOrganizationMembership(
        tx,
        auth.organizationId,
        user.id,
        normalized.active
      );

      return tx.organizationScimIdentity.findUniqueOrThrow({
        where: { id: createdIdentity.id },
        ...scimIdentityWithUserInclude,
      });
    });
    const actor = createScimSystemAuditActor(auth);

    await recordAuditLog({
      action: "organization.scim.user.provisioned",
      actor,
      targetId: identity.id,
      targetType: "organization_scim_identity",
      metadata: {
        organizationId: auth.organizationId,
        scimTokenId: auth.tokenId,
        provisionedUserId: identity.user.id,
        userName: identity.userName,
        externalId: identity.externalId,
        active: identity.active,
      },
      context: auth.requestContext,
    });

    const affectedWorkspaceIds = await findWorkspaceIdsForScimIdentity(identity.id);
    await syncWorkspaceScimAccessForWorkspaces(affectedWorkspaceIds, {
      actor,
      context: auth.requestContext,
      trigger: "scim.user.provisioned",
      organizationId: auth.organizationId,
    });

    const baseUrl = getScimBaseUrl(req);

    return scimJson(buildScimUserResource(identity, baseUrl), {
      status: 201,
      headers: {
        Location: `${baseUrl}/Users/${identity.id}`,
      },
    });
  } catch (error) {
    if (error instanceof ScimHttpError) {
      return scimError(error.message, error.status, error.scimType, error.headers);
    }

    logError("scim.users.create_failed", error, {}, req);
    return scimError("Failed to provision SCIM user", 500);
  }
}
