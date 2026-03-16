import { Prisma } from "@prisma/client";
import { z } from "zod";
import { recordAuditLog, type AuditActor } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { type RequestContext } from "@/lib/requestContext";
import {
  ScimHttpError,
  SCIM_CORE_GROUP_SCHEMA,
  type ScimAuthContext,
} from "@/lib/scim";

const SCIM_GROUP_WORKSPACE_ROLES = ["admin", "maintainer", "editor", "viewer"] as const;

const workspaceRolePriority: Record<(typeof SCIM_GROUP_WORKSPACE_ROLES)[number], number> = {
  admin: 4,
  maintainer: 3,
  editor: 2,
  viewer: 1,
};

const scimGroupMemberSchema = z
  .object({
    value: z.string().min(1).max(255),
  })
  .passthrough();

export const scimCreateGroupSchema = z
  .object({
    schemas: z.array(z.string()).optional(),
    externalId: z.string().max(255).optional().nullable(),
    displayName: z.string().min(1).max(255),
    members: z.array(scimGroupMemberSchema).max(1000).optional(),
  })
  .passthrough();

type PrismaLikeClient = Prisma.TransactionClient | typeof prisma;

export const scimGroupWithMembersInclude =
  Prisma.validator<Prisma.OrganizationScimGroupDefaultArgs>()({
    include: {
      members: {
        include: {
          scimIdentity: {
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  name: true,
                },
              },
            },
          },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
      workspaceMappings: {
        include: {
          workspace: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
  });

export interface ScimWorkspaceSyncAuditInput {
  actor?: AuditActor | null;
  context?: RequestContext | null;
  trigger: string;
  organizationId: string;
  sourceGroupIds?: string[];
}

interface ProvisionedSourceGrant {
  workspaceId: string;
  userId: string;
  scimGroupId: string;
  role: (typeof SCIM_GROUP_WORKSPACE_ROLES)[number];
}

interface WorkspaceScimSyncChange {
  type: "created" | "updated" | "deleted";
  workspaceId: string;
  userId: string;
  role: string | null;
  previousRole: string | null;
  sourceGroupIds: string[];
}

interface SyncWorkspaceResult {
  workspaceId: string;
  changes: WorkspaceScimSyncChange[];
}

function normalizeNullableString(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function rolePriority(role: string) {
  return workspaceRolePriority[role as keyof typeof workspaceRolePriority] || 0;
}

export function isScimWorkspaceRole(role: string): role is (typeof SCIM_GROUP_WORKSPACE_ROLES)[number] {
  return (SCIM_GROUP_WORKSPACE_ROLES as readonly string[]).includes(role);
}

export function normalizeScimGroupExternalId(externalId: string | null | undefined) {
  return normalizeNullableString(externalId);
}

export function resolveHighestWorkspaceRole(roles: string[]) {
  return roles.sort((left, right) => rolePriority(right) - rolePriority(left))[0] || "viewer";
}

export function createScimSystemAuditActor(auth: ScimAuthContext): AuditActor {
  return {
    id: `scim:${auth.tokenId}`,
    name: `${auth.organization.slug} SCIM`,
    role: "system",
  };
}

export function buildScimGroupResource(
  group: Prisma.OrganizationScimGroupGetPayload<typeof scimGroupWithMembersInclude>,
  baseUrl: string
) {
  const location = `${baseUrl}/Groups/${group.id}`;

  return {
    schemas: [SCIM_CORE_GROUP_SCHEMA],
    id: group.id,
    externalId: group.externalId || undefined,
    displayName: group.displayName,
    members: group.members.map((member) => ({
      value: member.scimIdentity.id,
      display:
        member.scimIdentity.displayName ||
        member.scimIdentity.user.name ||
        member.scimIdentity.userName,
      $ref: `${baseUrl}/Users/${member.scimIdentity.id}`,
    })),
    meta: {
      resourceType: "Group",
      created: group.createdAt.toISOString(),
      lastModified: group.updatedAt.toISOString(),
      location,
    },
  };
}

export async function assertScimGroupUniqueness(
  tx: PrismaLikeClient,
  input: {
    organizationId: string;
    displayName: string;
    externalId?: string | null;
    excludeGroupId?: string;
  }
) {
  const exclusion = input.excludeGroupId ? { id: { not: input.excludeGroupId } } : {};

  const existingByName = await tx.organizationScimGroup.findFirst({
    where: {
      organizationId: input.organizationId,
      displayName: input.displayName,
      ...exclusion,
    },
    select: { id: true },
  });
  if (existingByName) {
    throw new ScimHttpError(409, "SCIM group displayName already exists", "uniqueness");
  }

  if (input.externalId) {
    const existingByExternalId = await tx.organizationScimGroup.findFirst({
      where: {
        organizationId: input.organizationId,
        externalId: input.externalId,
        ...exclusion,
      },
      select: { id: true },
    });
    if (existingByExternalId) {
      throw new ScimHttpError(409, "SCIM group externalId already exists", "uniqueness");
    }
  }
}

export async function resolveScimIdentityIdsForGroup(
  tx: PrismaLikeClient,
  organizationId: string,
  memberIds: string[]
) {
  const uniqueMemberIds = [...new Set(memberIds)];
  if (uniqueMemberIds.length === 0) return [];

  const identities = await tx.organizationScimIdentity.findMany({
    where: {
      organizationId,
      id: { in: uniqueMemberIds },
    },
    select: { id: true },
  });

  if (identities.length !== uniqueMemberIds.length) {
    throw new ScimHttpError(400, "One or more SCIM group members do not exist", "invalidValue");
  }

  return identities.map((identity) => identity.id);
}

async function syncSingleWorkspaceScimAccess(
  tx: PrismaLikeClient,
  workspaceId: string
): Promise<SyncWorkspaceResult> {
  const mappings = await tx.workspaceScimGroupMapping.findMany({
    where: { workspaceId },
    include: {
      scimGroup: {
        include: {
          members: {
            include: {
              scimIdentity: {
                select: {
                  id: true,
                  userId: true,
                  active: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const desiredSourceGrants = new Map<string, ProvisionedSourceGrant>();
  for (const mapping of mappings) {
    if (!isScimWorkspaceRole(mapping.role)) continue;
    for (const member of mapping.scimGroup.members) {
      if (!member.scimIdentity.active) continue;

      const key = `${member.scimIdentity.userId}:${mapping.scimGroupId}`;
      desiredSourceGrants.set(key, {
        workspaceId,
        userId: member.scimIdentity.userId,
        scimGroupId: mapping.scimGroupId,
        role: mapping.role,
      });
    }
  }

  const existingSourceGrants = await tx.workspaceScimProvisionedMember.findMany({
    where: { workspaceId },
  });
  const existingSourceByKey = new Map(
    existingSourceGrants.map((grant) => [`${grant.userId}:${grant.scimGroupId}`, grant])
  );

  for (const existingGrant of existingSourceGrants) {
    const key = `${existingGrant.userId}:${existingGrant.scimGroupId}`;
    if (!desiredSourceGrants.has(key)) {
      await tx.workspaceScimProvisionedMember.delete({
        where: { id: existingGrant.id },
      });
    }
  }

  for (const desiredGrant of desiredSourceGrants.values()) {
    const existingGrant = existingSourceByKey.get(
      `${desiredGrant.userId}:${desiredGrant.scimGroupId}`
    );

    if (!existingGrant) {
      await tx.workspaceScimProvisionedMember.create({
        data: desiredGrant,
      });
      continue;
    }

    if (existingGrant.role !== desiredGrant.role) {
      await tx.workspaceScimProvisionedMember.update({
        where: { id: existingGrant.id },
        data: { role: desiredGrant.role },
      });
    }
  }

  const desiredRolesByUser = new Map<string, { role: string; sourceGroupIds: string[] }>();
  for (const grant of desiredSourceGrants.values()) {
    const existing = desiredRolesByUser.get(grant.userId);
    if (!existing) {
      desiredRolesByUser.set(grant.userId, {
        role: grant.role,
        sourceGroupIds: [grant.scimGroupId],
      });
      continue;
    }

    const nextRole =
      rolePriority(grant.role) > rolePriority(existing.role) ? grant.role : existing.role;
    desiredRolesByUser.set(grant.userId, {
      role: nextRole,
      sourceGroupIds: [...new Set([...existing.sourceGroupIds, grant.scimGroupId])],
    });
  }

  const workspaceMembers = await tx.workspaceMember.findMany({
    where: { workspaceId },
  });
  const existingMembersByUserId = new Map(
    workspaceMembers.map((member) => [member.userId, member])
  );

  const changes: WorkspaceScimSyncChange[] = [];

  for (const [userId, desired] of desiredRolesByUser.entries()) {
    const existingMember = existingMembersByUserId.get(userId);

    if (!existingMember) {
      await tx.workspaceMember.create({
        data: {
          workspaceId,
          userId,
          role: desired.role,
          managedByScim: true,
        },
      });
      changes.push({
        type: "created",
        workspaceId,
        userId,
        role: desired.role,
        previousRole: null,
        sourceGroupIds: desired.sourceGroupIds,
      });
      continue;
    }

    if (!existingMember.managedByScim) {
      continue;
    }

    if (existingMember.role !== desired.role) {
      await tx.workspaceMember.update({
        where: { id: existingMember.id },
        data: { role: desired.role },
      });
      changes.push({
        type: "updated",
        workspaceId,
        userId,
        role: desired.role,
        previousRole: existingMember.role,
        sourceGroupIds: desired.sourceGroupIds,
      });
    }
  }

  for (const existingMember of workspaceMembers) {
    if (!existingMember.managedByScim) continue;
    if (desiredRolesByUser.has(existingMember.userId)) continue;

    await tx.workspaceMember.delete({
      where: { id: existingMember.id },
    });
    changes.push({
      type: "deleted",
      workspaceId,
      userId: existingMember.userId,
      role: null,
      previousRole: existingMember.role,
      sourceGroupIds: [],
    });
  }

  return {
    workspaceId,
    changes,
  };
}

async function recordWorkspaceScimSyncAuditLogs(
  results: SyncWorkspaceResult[],
  audit?: ScimWorkspaceSyncAuditInput
) {
  if (!audit?.actor) return;

  const logs = results.flatMap((result) =>
    result.changes.map((change) => {
      const action =
        change.type === "created"
          ? "workspace.member.provisioned_by_scim"
          : change.type === "updated"
            ? "workspace.member.scim_role_updated"
            : "workspace.member.deprovisioned_by_scim";

      return recordAuditLog({
        action,
        actor: audit.actor,
        workspaceId: change.workspaceId,
        targetId: change.userId,
        targetType: "user",
        metadata: {
          organizationId: audit.organizationId,
          role: change.role,
          previousRole: change.previousRole,
          sourceGroupIds: change.sourceGroupIds,
          trigger: audit.trigger,
          changedByScimGroupIds: audit.sourceGroupIds || null,
        },
        context: audit.context,
      });
    })
  );

  await Promise.all(logs);
}

export async function syncWorkspaceScimAccessForWorkspaces(
  workspaceIds: string[],
  audit?: ScimWorkspaceSyncAuditInput
) {
  const uniqueWorkspaceIds = [...new Set(workspaceIds.filter(Boolean))];
  if (uniqueWorkspaceIds.length === 0) return;

  const results: SyncWorkspaceResult[] = [];
  for (const workspaceId of uniqueWorkspaceIds) {
    const result = await prisma.$transaction((tx) =>
      syncSingleWorkspaceScimAccess(tx, workspaceId)
    );
    results.push(result);
  }

  await recordWorkspaceScimSyncAuditLogs(results, audit);
}

export async function findWorkspaceIdsForScimGroups(groupIds: string[]) {
  const uniqueGroupIds = [...new Set(groupIds.filter(Boolean))];
  if (uniqueGroupIds.length === 0) return [];

  const mappings = await prisma.workspaceScimGroupMapping.findMany({
    where: {
      scimGroupId: { in: uniqueGroupIds },
    },
    select: {
      workspaceId: true,
    },
    distinct: ["workspaceId"],
  });

  return mappings.map((mapping) => mapping.workspaceId);
}

export async function findWorkspaceIdsForScimIdentity(identityId: string) {
  const mappings = await prisma.workspaceScimGroupMapping.findMany({
    where: {
      scimGroup: {
        members: {
          some: {
            scimIdentityId: identityId,
          },
        },
      },
    },
    select: {
      workspaceId: true,
    },
    distinct: ["workspaceId"],
  });

  return mappings.map((mapping) => mapping.workspaceId);
}

export async function validateWorkspaceScimMappingInput(
  organizationId: string,
  input: {
    workspaceId: string;
    scimGroupId: string;
    role: string;
  }
) {
  if (!isScimWorkspaceRole(input.role)) {
    throw new ScimHttpError(400, "Invalid SCIM workspace role", "invalidValue");
  }

  const [workspace, group] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: input.workspaceId },
      select: {
        id: true,
        organizationId: true,
        name: true,
        slug: true,
      },
    }),
    prisma.organizationScimGroup.findUnique({
      where: { id: input.scimGroupId },
      select: {
        id: true,
        organizationId: true,
        displayName: true,
      },
    }),
  ]);

  if (!workspace || workspace.organizationId !== organizationId) {
    throw new ScimHttpError(404, "Workspace not found for this organization");
  }

  if (!group || group.organizationId !== organizationId) {
    throw new ScimHttpError(404, "SCIM group not found for this organization");
  }

  return { workspace, group };
}

export async function createScimGroup(
  auth: ScimAuthContext,
  input: z.infer<typeof scimCreateGroupSchema>
) {
  const normalizedExternalId = normalizeScimGroupExternalId(input.externalId);
  const displayName = input.displayName.trim();
  const memberIds = (input.members || []).map((member) => member.value.trim()).filter(Boolean);

  const group = await prisma.$transaction(async (tx) => {
    await assertScimGroupUniqueness(tx, {
      organizationId: auth.organizationId,
      displayName,
      externalId: normalizedExternalId,
    });

    const scimIdentityIds = await resolveScimIdentityIdsForGroup(
      tx,
      auth.organizationId,
      memberIds
    );

    const createdGroup = await tx.organizationScimGroup.create({
      data: {
        organizationId: auth.organizationId,
        displayName,
        externalId: normalizedExternalId,
        lastProvisionedAt: new Date(),
      },
      select: {
        id: true,
      },
    });

    if (scimIdentityIds.length > 0) {
      await tx.organizationScimGroupMember.createMany({
        data: scimIdentityIds.map((scimIdentityId) => ({
          scimGroupId: createdGroup.id,
          scimIdentityId,
        })),
        skipDuplicates: true,
      });
    }

    return tx.organizationScimGroup.findUniqueOrThrow({
      where: { id: createdGroup.id },
      ...scimGroupWithMembersInclude,
    });
  });

  return group;
}

export async function updateScimGroupMembers(
  tx: PrismaLikeClient,
  groupId: string,
  nextIdentityIds: string[]
) {
  const currentMembers = await tx.organizationScimGroupMember.findMany({
    where: { scimGroupId: groupId },
    select: {
      id: true,
      scimIdentityId: true,
    },
  });

  const currentIds = new Set(currentMembers.map((member) => member.scimIdentityId));
  const nextIds = new Set(nextIdentityIds);

  for (const member of currentMembers) {
    if (!nextIds.has(member.scimIdentityId)) {
      await tx.organizationScimGroupMember.delete({
        where: { id: member.id },
      });
    }
  }

  const missingIdentityIds = nextIdentityIds.filter((id) => !currentIds.has(id));
  if (missingIdentityIds.length > 0) {
    await tx.organizationScimGroupMember.createMany({
      data: missingIdentityIds.map((scimIdentityId) => ({
        scimGroupId: groupId,
        scimIdentityId,
      })),
      skipDuplicates: true,
    });
  }
}
