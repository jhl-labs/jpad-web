import type { Account, Profile, User } from "next-auth";
import type { OAuthConfig } from "next-auth/providers/oauth";
import { prisma } from "@/lib/prisma";
import { getOidcConfig, normalizeEmailAddress } from "@/lib/auth/config";

type OidcProfile = Profile & Record<string, unknown>;

interface ProvisionedUser {
  id: string;
  email: string;
  name: string;
}

type ReconcileResult =
  | { ok: true; user: ProvisionedUser }
  | { ok: false; error: string };

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

function getFallbackName(email: string): string {
  return email.split("@")[0] || "SSO User";
}

export function getOidcProvider(): OAuthConfig<OidcProfile> | null {
  const config = getOidcConfig();
  if (!config) return null;

  return {
    id: "oidc",
    name: config.name,
    type: "oauth",
    issuer: config.issuer,
    wellKnown: config.wellKnown,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    authorization: {
      params: {
        scope: config.scope,
      },
    },
    idToken: true,
    checks: ["pkce", "state"],
    profile(profile) {
      const email = readString(profile.email);
      const normalizedEmail = email ? normalizeEmailAddress(email) : null;

      return {
        id: readString(profile.sub) || "",
        email: normalizedEmail,
        name:
          readString(profile.name) ||
          readString(profile.preferred_username) ||
          (normalizedEmail ? getFallbackName(normalizedEmail) : "SSO User"),
      } satisfies User;
    },
  };
}

export async function reconcileOidcUser(params: {
  user: User;
  account: Account;
  profile?: Profile;
}): Promise<ReconcileResult> {
  const config = getOidcConfig();
  if (!config) {
    return { ok: false, error: "OIDCProviderDisabled" };
  }

  const profile = (params.profile || {}) as OidcProfile;
  const subject =
    readString(params.account.providerAccountId) || readString(profile.sub);
  const rawEmail = readString(profile.email) || readString(params.user.email);

  if (!subject) {
    return { ok: false, error: "OIDCSubjectMissing" };
  }

  if (!rawEmail) {
    return { ok: false, error: "OIDCEmailRequired" };
  }

  const email = normalizeEmailAddress(rawEmail);
  const emailVerified = readBoolean(profile.email_verified);

  if (config.requireVerifiedEmail && emailVerified !== true) {
    return { ok: false, error: "OIDCEmailNotVerified" };
  }

  const name =
    readString(profile.name) ||
    readString(params.user.name) ||
    readString(profile.preferred_username) ||
    getFallbackName(email);

  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const existingBySubject = await tx.user.findFirst({
      where: {
        oidcIssuer: config.issuer,
        oidcSubject: subject,
      },
      select: {
        id: true,
        email: true,
      },
    });

    if (existingBySubject) {
      const conflictingUsers =
        existingBySubject.email !== email
          ? await tx.user.findMany({
              where: {
                email: {
                  equals: email,
                  mode: "insensitive",
                },
              },
              select: { id: true },
              take: 2,
            })
          : null;

      if (
        conflictingUsers &&
        (conflictingUsers.length > 1 ||
          (conflictingUsers[0] && conflictingUsers[0].id !== existingBySubject.id))
      ) {
        return { ok: false, error: "OIDCEmailConflict" } satisfies ReconcileResult;
      }

      const updatedUser = await tx.user.update({
        where: { id: existingBySubject.id },
        data: {
          email,
          name,
          lastLoginAt: now,
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });

      return { ok: true, user: updatedUser } satisfies ReconcileResult;
    }

    const existingByEmailMatches = await tx.user.findMany({
      where: {
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        oidcIssuer: true,
        oidcSubject: true,
      },
      take: 2,
    });

    if (existingByEmailMatches.length > 1) {
      return { ok: false, error: "OIDCEmailConflict" } satisfies ReconcileResult;
    }

    const existingByEmail = existingByEmailMatches[0];

    if (existingByEmail) {
      if (
        existingByEmail.oidcIssuer &&
        (existingByEmail.oidcIssuer !== config.issuer ||
          existingByEmail.oidcSubject !== subject)
      ) {
        return { ok: false, error: "OIDCAccountConflict" } satisfies ReconcileResult;
      }

      if (!config.allowEmailLinking && !existingByEmail.oidcSubject) {
        return { ok: false, error: "OIDCLinkRequired" } satisfies ReconcileResult;
      }

      const linkedUser = await tx.user.update({
        where: { id: existingByEmail.id },
        data: {
          name,
          oidcIssuer: config.issuer,
          oidcSubject: subject,
          lastLoginAt: now,
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });

      return { ok: true, user: linkedUser } satisfies ReconcileResult;
    }

    const createdUser = await tx.user.create({
      data: {
        email,
        name,
        hashedPassword: null,
        oidcIssuer: config.issuer,
        oidcSubject: subject,
        lastLoginAt: now,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    return { ok: true, user: createdUser } satisfies ReconcileResult;
  });
}
