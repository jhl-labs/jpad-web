import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { normalizeEmailAddress } from "@/lib/auth/config";

export interface OrganizationAccessMember {
  id: string;
  role: string;
  userId: string;
  organizationId: string;
}

const ORGANIZATION_ROLE_LEVEL: Record<string, number> = {
  member: 1,
  admin: 2,
  owner: 3,
};

export function normalizeOrganizationDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^@/, "").replace(/\.+$/, "");
}

export function extractEmailDomain(email: string): string | null {
  const normalizedEmail = normalizeEmailAddress(email);
  const parts = normalizedEmail.split("@");
  if (parts.length !== 2 || !parts[1]) return null;
  return parts[1];
}

export function canManageOrganization(role: string): boolean {
  return ["owner", "admin"].includes(role);
}

export function canCreateOrganizationWorkspace(role: string): boolean {
  return ["owner", "admin"].includes(role);
}

export function generateOrganizationDomainVerificationToken(): string {
  return randomBytes(24).toString("hex");
}

export function buildOrganizationDomainTxtRecord(domain: string) {
  const normalizedDomain = normalizeOrganizationDomain(domain);
  return {
    name: `_jpad.${normalizedDomain}`,
    valuePrefix: "jpad-domain-verification=",
  };
}

export async function checkOrganizationAccess(
  userId: string,
  organizationId: string,
  requiredRoles?: string[]
): Promise<OrganizationAccessMember | null> {
  const member = await prisma.organizationMember.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  });

  if (!member) return null;
  if (!requiredRoles) return member;

  const minimumLevel = Math.min(
    ...requiredRoles
      .map((role) => ORGANIZATION_ROLE_LEVEL[role] || 0)
      .filter(Boolean)
  );

  return (ORGANIZATION_ROLE_LEVEL[member.role] || 0) >= minimumLevel ? member : null;
}

export async function autoJoinOrganizationsForUser(userId: string, email: string) {
  const emailDomain = extractEmailDomain(email);
  if (!emailDomain) return [];

  const domains = await prisma.organizationDomain.findMany({
    where: {
      domain: emailDomain,
      autoJoin: true,
      verifiedAt: { not: null },
    },
    select: {
      organizationId: true,
    },
  });

  if (domains.length === 0) return [];

  const organizationIds = [...new Set(domains.map((domain) => domain.organizationId))];
  const existingMemberships = await prisma.organizationMember.findMany({
    where: {
      userId,
      organizationId: { in: organizationIds },
    },
    select: {
      organizationId: true,
    },
  });

  const existingOrganizationIds = new Set(
    existingMemberships.map((membership) => membership.organizationId)
  );
  const blockedScimIdentityOrganizations = await prisma.organizationScimIdentity.findMany({
    where: {
      userId,
      organizationId: { in: organizationIds },
      active: false,
    },
    select: {
      organizationId: true,
    },
  });
  const blockedOrganizationIds = new Set(
    blockedScimIdentityOrganizations.map((identity) => identity.organizationId)
  );

  const missingOrganizationIds = organizationIds.filter(
    (organizationId) =>
      !existingOrganizationIds.has(organizationId) &&
      !blockedOrganizationIds.has(organizationId)
  );

  if (missingOrganizationIds.length > 0) {
    await prisma.organizationMember.createMany({
      data: missingOrganizationIds.map((organizationId) => ({
        organizationId,
        userId,
        role: "member",
      })),
      skipDuplicates: true,
    });
  }

  return missingOrganizationIds;
}
