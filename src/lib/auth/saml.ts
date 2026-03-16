import { SAML, ValidateInResponseTo, type CacheProvider } from "@node-saml/node-saml";
import type { Profile } from "@node-saml/node-saml";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { getSamlConfig, normalizeEmailAddress } from "@/lib/auth/config";

type SamlReconcileResult =
  | {
      ok: true;
      user: {
        id: string;
        email: string;
        name: string;
      };
    }
  | { ok: false; error: string };

const CACHE_PREFIX = "saml:request-id:";
const samlCacheFallback = new Map<string, { value: string; expiresAt: number }>();

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getFallbackName(email: string) {
  return email.split("@")[0] || "SSO User";
}

function cleanupFallbackCache(now = Date.now()) {
  for (const [key, entry] of samlCacheFallback.entries()) {
    if (entry.expiresAt <= now) {
      samlCacheFallback.delete(key);
    }
  }
}

class RedisSamlCacheProvider implements CacheProvider {
  constructor(private readonly ttlMs: number) {}

  async saveAsync(key: string, value: string) {
    const createdAt = Date.now();
    const expiresAt = createdAt + this.ttlMs;

    try {
      await redis.set(`${CACHE_PREFIX}${key}`, value, "PX", this.ttlMs);
    } catch {
      cleanupFallbackCache(createdAt);
      samlCacheFallback.set(key, { value, expiresAt });
    }

    return { value, createdAt };
  }

  async getAsync(key: string) {
    try {
      const cached = await redis.get(`${CACHE_PREFIX}${key}`);
      if (cached) return cached;
    } catch {
      cleanupFallbackCache();
    }

    const fallback = samlCacheFallback.get(key);
    if (!fallback) return null;
    if (fallback.expiresAt <= Date.now()) {
      samlCacheFallback.delete(key);
      return null;
    }
    return fallback.value;
  }

  async removeAsync(key: string | null) {
    if (!key) return null;

    let redisValue: string | null = null;
    try {
      redisValue = await redis.get(`${CACHE_PREFIX}${key}`);
      await redis.del(`${CACHE_PREFIX}${key}`);
    } catch {
      cleanupFallbackCache();
    }

    const fallback = samlCacheFallback.get(key)?.value ?? null;
    samlCacheFallback.delete(key);
    return redisValue ?? fallback;
  }
}

function getSamlClient() {
  const config = getSamlConfig();
  if (!config) {
    throw new Error("SAMLProviderDisabled");
  }

  return new SAML({
    issuer: config.issuer,
    callbackUrl: config.callbackUrl,
    entryPoint: config.entryPoint,
    idpCert: config.idpCert,
    idpIssuer: config.idpIssuer,
    validateInResponseTo: ValidateInResponseTo.always,
    requestIdExpirationPeriodMs: config.requestIdExpirationPeriodMs,
    acceptedClockSkewMs: config.acceptedClockSkewMs,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: false,
    disableRequestedAuthnContext: true,
    identifierFormat: null,
    cacheProvider: new RedisSamlCacheProvider(config.requestIdExpirationPeriodMs),
  });
}

function readSamlEmail(profile: Profile): string | null {
  const candidates = [
    profile.email,
    profile.mail,
    profile["urn:oid:0.9.2342.19200300.100.1.3"],
    profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"],
  ];

  for (const candidate of candidates) {
    const value = readString(candidate);
    if (value) return normalizeEmailAddress(value);
  }

  const nameId = readString(profile.nameID);
  if (nameId?.includes("@")) {
    return normalizeEmailAddress(nameId);
  }

  return null;
}

function readSamlName(profile: Profile, email: string | null): string {
  const preferred =
    readString(profile.displayName) ||
    readString(profile.name) ||
    readString(profile.cn) ||
    readString(profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name"]);

  if (preferred) return preferred;

  const givenName =
    readString(profile.givenName) ||
    readString(profile.firstName) ||
    readString(profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"]);
  const familyName =
    readString(profile.sn) ||
    readString(profile.lastName) ||
    readString(profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"]);

  const fullName = [givenName, familyName].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;

  return email ? getFallbackName(email) : "SSO User";
}

export function sanitizeAuthCallbackUrl(callbackUrl: string | null | undefined) {
  if (!callbackUrl) return "/workspace";
  if (!callbackUrl.startsWith("/") || callbackUrl.startsWith("//")) {
    return "/workspace";
  }
  return callbackUrl;
}

export function getSamlProviderSummary() {
  const config = getSamlConfig();
  if (!config) return null;

  return {
    name: config.name,
    callbackUrl: config.callbackUrl,
    issuer: config.issuer,
  };
}

export async function getSamlAuthorizeUrl(callbackUrl: string) {
  const saml = getSamlClient();
  return saml.getAuthorizeUrlAsync(sanitizeAuthCallbackUrl(callbackUrl), undefined, {});
}

export async function validateSamlResponse(samlResponse: string) {
  const saml = getSamlClient();
  return saml.validatePostResponseAsync({ SAMLResponse: samlResponse });
}

export function generateSamlServiceProviderMetadata() {
  const saml = getSamlClient();
  return saml.generateServiceProviderMetadata(null);
}

export async function reconcileSamlUser(profile: Profile): Promise<SamlReconcileResult> {
  const config = getSamlConfig();
  if (!config) {
    return { ok: false, error: "SAMLProviderDisabled" };
  }

  const issuer = readString(profile.issuer) || config.idpIssuer || null;
  const subject = readString(profile.nameID);

  if (!issuer) {
    return { ok: false, error: "SAMLIssuerMissing" };
  }

  if (!subject) {
    return { ok: false, error: "SAMLSubjectMissing" };
  }

  const email = readSamlEmail(profile);
  if (config.requireEmail && !email) {
    return { ok: false, error: "SAMLEmailRequired" };
  }

  const resolvedEmail = email || `${subject}@saml.local`;
  const name = readSamlName(profile, email);
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const existingBySubject = await tx.user.findFirst({
      where: {
        samlIssuer: issuer,
        samlSubject: subject,
      },
      select: {
        id: true,
        email: true,
      },
    });

    if (existingBySubject) {
      const conflictingUsers =
        existingBySubject.email !== resolvedEmail
          ? await tx.user.findMany({
              where: {
                email: {
                  equals: resolvedEmail,
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
        return { ok: false, error: "SAMLEmailConflict" } satisfies SamlReconcileResult;
      }

      const updatedUser = await tx.user.update({
        where: { id: existingBySubject.id },
        data: {
          email: resolvedEmail,
          name,
          lastLoginAt: now,
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });

      return { ok: true, user: updatedUser } satisfies SamlReconcileResult;
    }

    const existingByEmailMatches = await tx.user.findMany({
      where: {
        email: {
          equals: resolvedEmail,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        samlIssuer: true,
        samlSubject: true,
      },
      take: 2,
    });

    if (existingByEmailMatches.length > 1) {
      return { ok: false, error: "SAMLEmailConflict" } satisfies SamlReconcileResult;
    }

    const existingByEmail = existingByEmailMatches[0];

    if (existingByEmail) {
      if (
        existingByEmail.samlIssuer &&
        (existingByEmail.samlIssuer !== issuer || existingByEmail.samlSubject !== subject)
      ) {
        return { ok: false, error: "SAMLAccountConflict" } satisfies SamlReconcileResult;
      }

      if (!config.allowEmailLinking && !existingByEmail.samlSubject) {
        return { ok: false, error: "SAMLLinkRequired" } satisfies SamlReconcileResult;
      }

      const linkedUser = await tx.user.update({
        where: { id: existingByEmail.id },
        data: {
          name,
          samlIssuer: issuer,
          samlSubject: subject,
          lastLoginAt: now,
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });

      return { ok: true, user: linkedUser } satisfies SamlReconcileResult;
    }

    const createdUser = await tx.user.create({
      data: {
        email: resolvedEmail,
        name,
        hashedPassword: null,
        samlIssuer: issuer,
        samlSubject: subject,
        lastLoginAt: now,
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    return { ok: true, user: createdUser } satisfies SamlReconcileResult;
  });
}
