import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  buildScimDisplayName,
  extractScimEmail,
  normalizeScimUserName,
  type ScimCreateUserInput,
  ScimHttpError,
} from "@/lib/scim";

type PrismaLikeClient = Prisma.TransactionClient | typeof prisma;

export const scimIdentityWithUserInclude =
  Prisma.validator<Prisma.OrganizationScimIdentityDefaultArgs>()({
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

export interface NormalizedScimUserPayload {
  email: string;
  userName: string;
  externalId: string | null;
  active: boolean;
  displayName: string | null;
  givenName: string | null;
  familyName: string | null;
  resolvedName: string;
}

function toNullableTrimmedString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function normalizeScimCreateUserInput(
  input: ScimCreateUserInput
): NormalizedScimUserPayload {
  const email = extractScimEmail({
    userName: input.userName,
    emails: input.emails,
  });
  if (!email) {
    throw new ScimHttpError(
      400,
      "SCIM user requires a valid email in userName or emails[].value",
      "invalidValue"
    );
  }

  const givenName = toNullableTrimmedString(input.name?.givenName ?? null);
  const familyName = toNullableTrimmedString(input.name?.familyName ?? null);
  const displayName = toNullableTrimmedString(input.displayName ?? null);

  return {
    email,
    userName: normalizeScimUserName(input.userName),
    externalId: toNullableTrimmedString(input.externalId ?? null),
    active: input.active ?? true,
    displayName,
    givenName,
    familyName,
    resolvedName: buildScimDisplayName({
      displayName,
      givenName,
      familyName,
      email,
    }),
  };
}

export async function findSingleUserByEmail(
  tx: PrismaLikeClient,
  email: string
) {
  const users = await tx.user.findMany({
    where: {
      email: {
        equals: email,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      email: true,
      name: true,
    },
    take: 2,
  });

  if (users.length > 1) {
    throw new ScimHttpError(
      409,
      "Multiple local users already exist for this email address",
      "uniqueness"
    );
  }

  return users[0] || null;
}

export async function assertScimIdentityUniqueness(
  tx: PrismaLikeClient,
  input: {
    organizationId: string;
    userName: string;
    externalId?: string | null;
    userId?: string | null;
    excludeIdentityId?: string;
  }
) {
  const identityExclusionFilter = input.excludeIdentityId
    ? { id: { not: input.excludeIdentityId } }
    : {};

  const existingByUserName = await tx.organizationScimIdentity.findFirst({
    where: {
      organizationId: input.organizationId,
      userName: input.userName,
      ...identityExclusionFilter,
    },
    select: { id: true },
  });
  if (existingByUserName) {
    throw new ScimHttpError(409, "SCIM userName already exists", "uniqueness");
  }

  if (input.externalId) {
    const existingByExternalId = await tx.organizationScimIdentity.findFirst({
      where: {
        organizationId: input.organizationId,
        externalId: input.externalId,
        ...identityExclusionFilter,
      },
      select: { id: true },
    });
    if (existingByExternalId) {
      throw new ScimHttpError(409, "SCIM externalId already exists", "uniqueness");
    }
  }

  if (input.userId) {
    const existingByUser = await tx.organizationScimIdentity.findFirst({
      where: {
        organizationId: input.organizationId,
        userId: input.userId,
        ...identityExclusionFilter,
      },
      select: { id: true },
    });
    if (existingByUser) {
      throw new ScimHttpError(
        409,
        "A SCIM identity already exists for this organization member",
        "uniqueness"
      );
    }
  }
}
