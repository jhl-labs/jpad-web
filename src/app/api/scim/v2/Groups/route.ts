import { NextRequest } from "next/server";
import { recordAuditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  buildScimListResponse,
  getScimBaseUrl,
  parseScimFilter,
  requireScimAuth,
  SCIM_CORE_GROUP_SCHEMA,
  scimError,
  scimJson,
  ScimHttpError,
} from "@/lib/scim";
import {
  buildScimGroupResource,
  createScimGroup,
  createScimSystemAuditActor,
  findWorkspaceIdsForScimGroups,
  scimCreateGroupSchema,
  scimGroupWithMembersInclude,
  syncWorkspaceScimAccessForWorkspaces,
} from "@/lib/scimGroups";

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
      "displayName",
    ]);
    const baseUrl = getScimBaseUrl(req);

    const where = {
      organizationId: auth.organizationId,
      ...(filter?.field === "id" ? { id: filter.value } : {}),
      ...(filter?.field === "externalId" ? { externalId: filter.value } : {}),
      ...(filter?.field === "displayName" ? { displayName: filter.value } : {}),
    };

    const [groups, totalResults] = await Promise.all([
      prisma.organizationScimGroup.findMany({
        where,
        ...scimGroupWithMembersInclude,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: startIndex - 1,
        take: count,
      }),
      prisma.organizationScimGroup.count({ where }),
    ]);

    return scimJson(
      buildScimListResponse(
        groups.map((group) => buildScimGroupResource(group, baseUrl)),
        totalResults,
        startIndex,
        groups.length
      )
    );
  } catch (error) {
    if (error instanceof ScimHttpError) {
      return scimError(error.message, error.status, error.scimType, error.headers);
    }

    logError("scim.groups.list_failed", error, {}, req);
    return scimError("Failed to list SCIM groups", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireScimAuth(req);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return scimError("Invalid SCIM JSON payload", 400, "invalidSyntax");
    }

    const parsed = scimCreateGroupSchema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || "Invalid SCIM group payload";
      return scimError(firstError, 400, "invalidValue");
    }

    if (
      parsed.data.schemas &&
      !parsed.data.schemas.includes(SCIM_CORE_GROUP_SCHEMA)
    ) {
      return scimError("Unsupported SCIM schema for Group resource", 400, "invalidSyntax");
    }

    const group = await createScimGroup(auth, parsed.data);
    const actor = createScimSystemAuditActor(auth);

    await recordAuditLog({
      action: "organization.scim.group.created",
      actor,
      targetId: group.id,
      targetType: "organization_scim_group",
      metadata: {
        organizationId: auth.organizationId,
        scimTokenId: auth.tokenId,
        displayName: group.displayName,
        externalId: group.externalId,
        memberCount: group.members.length,
      },
      context: auth.requestContext,
    });

    const affectedWorkspaceIds = await findWorkspaceIdsForScimGroups([group.id]);
    await syncWorkspaceScimAccessForWorkspaces(affectedWorkspaceIds, {
      actor,
      context: auth.requestContext,
      trigger: "scim.group.created",
      organizationId: auth.organizationId,
      sourceGroupIds: [group.id],
    });

    const baseUrl = getScimBaseUrl(req);

    return scimJson(buildScimGroupResource(group, baseUrl), {
      status: 201,
      headers: {
        Location: `${baseUrl}/Groups/${group.id}`,
      },
    });
  } catch (error) {
    if (error instanceof ScimHttpError) {
      return scimError(error.message, error.status, error.scimType, error.headers);
    }

    logError("scim.groups.create_failed", error, {}, req);
    return scimError("Failed to create SCIM group", 500);
  }
}
