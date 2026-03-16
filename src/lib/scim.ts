import { createHash, randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { normalizeEmailAddress } from "@/lib/auth/config";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { rateLimitRedis } from "@/lib/rateLimit";
import { getRequestContext, type RequestContext } from "@/lib/requestContext";

export const SCIM_CONTENT_TYPE = "application/scim+json";
export const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
export const SCIM_LIST_RESPONSE_SCHEMA =
  "urn:ietf:params:scim:api:messages:2.0:ListResponse";
export const SCIM_PATCH_OP_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
export const SCIM_CORE_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
export const SCIM_CORE_GROUP_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:Group";

const MAX_SCIM_REQUESTS_PER_MINUTE = 600;
const SCIM_TOKEN_LAST_USED_UPDATE_INTERVAL_MS = 5 * 60_000;

const scimEmailSchema = z
  .object({
    value: z.string().min(1).max(320),
    primary: z.boolean().optional(),
    type: z.string().max(50).optional(),
  })
  .passthrough();

const scimNameSchema = z
  .object({
    formatted: z.string().max(255).optional().nullable(),
    givenName: z.string().max(255).optional().nullable(),
    familyName: z.string().max(255).optional().nullable(),
  })
  .passthrough();

export const scimCreateUserSchema = z
  .object({
    schemas: z.array(z.string()).optional(),
    externalId: z.string().max(255).optional().nullable(),
    userName: z.string().min(1).max(320),
    active: z.boolean().optional(),
    displayName: z.string().max(255).optional().nullable(),
    name: scimNameSchema.optional().nullable(),
    emails: z.array(scimEmailSchema).max(10).optional(),
  })
  .passthrough();

export const scimPatchSchema = z
  .object({
    schemas: z.array(z.string()).min(1),
    Operations: z
      .array(
        z
          .object({
            op: z.string().min(1).max(20),
            path: z.string().max(255).optional(),
            value: z.unknown().optional(),
          })
          .passthrough()
      )
      .min(1)
      .max(20),
  })
  .passthrough();

export interface ScimAuthContext {
  organizationId: string;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
  tokenId: string;
  requestContext: RequestContext;
}

export interface ScimAuditActor {
  id: string;
  name: string;
  role: string;
}

export interface ScimFilter {
  field: string;
  value: string;
}

export type ScimCreateUserInput = z.infer<typeof scimCreateUserSchema>;
export type ScimPatchInput = z.infer<typeof scimPatchSchema>;

export type ScimIdentityRecord = Prisma.OrganizationScimIdentityGetPayload<{
  include: {
    user: {
      select: {
        id: true;
        email: true;
        name: true;
      };
    };
  };
}>;

type PrismaLikeClient = Prisma.TransactionClient | typeof prisma;

export class ScimHttpError extends Error {
  status: number;
  scimType?: string;
  headers?: HeadersInit;

  constructor(status: number, message: string, scimType?: string, headers?: HeadersInit) {
    super(message);
    this.name = "ScimHttpError";
    this.status = status;
    this.scimType = scimType;
    this.headers = headers;
  }
}

export function createScimToken(): string {
  return `jpad_scim_${randomBytes(32).toString("base64url")}`;
}

export function hashScimToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function scimJson(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", SCIM_CONTENT_TYPE);

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}

export function scimError(
  detail: string,
  status: number,
  scimType?: string,
  headers?: HeadersInit
) {
  return scimJson(
    {
      schemas: [SCIM_ERROR_SCHEMA],
      detail,
      status: String(status),
      ...(scimType ? { scimType } : {}),
    },
    {
      status,
      headers,
    }
  );
}

function parseBearerToken(authorizationHeader: string | null): string | null {
  if (!authorizationHeader) return null;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function requireScimAuth(req: Request): Promise<ScimAuthContext> {
  const token = parseBearerToken(req.headers.get("authorization"));
  if (!token) {
    throw new ScimHttpError(
      401,
      "Missing SCIM bearer token",
      undefined,
      { "WWW-Authenticate": 'Bearer realm="scim"' }
    );
  }

  const tokenRecord = await prisma.organizationScimToken.findFirst({
    where: {
      tokenHash: hashScimToken(token),
      revokedAt: null,
    },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  if (!tokenRecord) {
    throw new ScimHttpError(
      401,
      "Invalid SCIM bearer token",
      undefined,
      { "WWW-Authenticate": 'Bearer error="invalid_token"' }
    );
  }

  const rateLimitAllowed = await rateLimitRedis(
    `scim:${tokenRecord.id}`,
    MAX_SCIM_REQUESTS_PER_MINUTE,
    60_000
  );
  if (!rateLimitAllowed) {
    throw new ScimHttpError(
      429,
      "SCIM rate limit exceeded",
      undefined,
      { "Retry-After": "60" }
    );
  }

  if (
    !tokenRecord.lastUsedAt ||
    Date.now() - tokenRecord.lastUsedAt.getTime() >= SCIM_TOKEN_LAST_USED_UPDATE_INTERVAL_MS
  ) {
    prisma.organizationScimToken
      .update({
        where: { id: tokenRecord.id },
        data: {
          lastUsedAt: new Date(),
        },
      })
      .catch((error) => {
        logError("scim.token.last_used_update_failed", error, {
          organizationId: tokenRecord.organizationId,
          tokenId: tokenRecord.id,
        });
      });
  }

  return {
    organizationId: tokenRecord.organizationId,
    organization: tokenRecord.organization,
    tokenId: tokenRecord.id,
    requestContext: getRequestContext(req),
  };
}

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseEmail(value: string | null): string | null {
  if (!value) return null;
  const result = z.string().email().safeParse(value);
  if (!result.success) return null;
  return normalizeEmailAddress(result.data);
}

export function normalizeScimUserName(userName: string): string {
  const trimmed = userName.trim();
  return parseEmail(trimmed) || trimmed;
}

export function extractScimEmail(input: {
  userName?: string | null;
  emails?: Array<{ value?: string | null; primary?: boolean | null }>;
}): string | null {
  const prioritizedEmails = [...(input.emails || [])].sort((a, b) =>
    a.primary === b.primary ? 0 : a.primary ? -1 : 1
  );

  for (const emailEntry of prioritizedEmails) {
    const parsedEmail = parseEmail(readTrimmedString(emailEntry.value));
    if (parsedEmail) return parsedEmail;
  }

  return parseEmail(readTrimmedString(input.userName));
}

export function createScimAuditActor(auth: ScimAuthContext): ScimAuditActor {
  return {
    id: `scim:${auth.tokenId}`,
    name: `${auth.organization.slug} SCIM`,
    role: "system",
  };
}

export function buildScimDisplayName(input: {
  displayName?: string | null;
  givenName?: string | null;
  familyName?: string | null;
  email?: string | null;
}) {
  const displayName = readTrimmedString(input.displayName);
  if (displayName) return displayName;

  const givenName = readTrimmedString(input.givenName);
  const familyName = readTrimmedString(input.familyName);
  const fullName = [givenName, familyName].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;

  if (input.email) {
    return input.email.split("@")[0] || "SCIM User";
  }

  return "SCIM User";
}

export function parseScimFilter(
  filterValue: string | null,
  allowedFields: string[]
): ScimFilter | null {
  if (!filterValue) return null;

  const escapedFields = allowedFields.map((field) => field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const match = filterValue.match(
    new RegExp(`^\\s*(${escapedFields.join("|")})\\s+eq\\s+"([^"]+)"\\s*$`, "i")
  );
  if (!match) {
    throw new ScimHttpError(
      400,
      `Only ${allowedFields.join(", ")} equality filters are supported`,
      "invalidFilter"
    );
  }

  const [, field, rawValue] = match;
  const value = rawValue.trim();
  if (!value) {
    throw new ScimHttpError(400, "SCIM filter value cannot be empty", "invalidFilter");
  }

  return {
    field: field as ScimFilter["field"],
    value,
  };
}

export function buildScimIdentityWhereInput(
  organizationId: string,
  filter: ScimFilter | null
): Prisma.OrganizationScimIdentityWhereInput {
  if (!filter) {
    return { organizationId };
  }

  if (filter.field === "id") {
    return {
      organizationId,
      id: filter.value,
    };
  }

  if (filter.field === "externalId") {
    return {
      organizationId,
      externalId: filter.value,
    };
  }

  return {
    organizationId,
    userName: normalizeScimUserName(filter.value),
  };
}

export function getScimBaseUrl(req: Request): string {
  return `${new URL(req.url).origin}/api/scim/v2`;
}

export function buildScimUserResource(identity: ScimIdentityRecord, baseUrl: string) {
  const location = `${baseUrl}/Users/${identity.id}`;

  return {
    schemas: [SCIM_CORE_USER_SCHEMA],
    id: identity.id,
    externalId: identity.externalId || undefined,
    userName: identity.userName,
    active: identity.active,
    displayName: identity.displayName || identity.user.name,
    name: {
      formatted: identity.displayName || identity.user.name,
      givenName: identity.givenName || undefined,
      familyName: identity.familyName || undefined,
    },
    emails: [
      {
        value: identity.user.email,
        primary: true,
        type: "work",
      },
    ],
    meta: {
      resourceType: "User",
      created: identity.createdAt.toISOString(),
      lastModified: identity.updatedAt.toISOString(),
      location,
    },
  };
}

export function buildScimListResponse<T>(
  resources: T[],
  totalResults: number,
  startIndex: number,
  itemsPerPage: number
) {
  return {
    schemas: [SCIM_LIST_RESPONSE_SCHEMA],
    totalResults,
    startIndex,
    itemsPerPage,
    Resources: resources,
  };
}

export async function syncScimOrganizationMembership(
  tx: PrismaLikeClient,
  organizationId: string,
  userId: string,
  active: boolean
) {
  const membership = await tx.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
  });

  if (active) {
    if (!membership) {
      await tx.organizationMember.create({
        data: {
          organizationId,
          userId,
          role: "member",
        },
      });
    }
    return;
  }

  if (!membership) return;

  if (membership.role === "owner" || membership.role === "admin") {
    throw new ScimHttpError(
      409,
      "Elevated organization members must be deprovisioned manually",
      "mutability"
    );
  }

  await tx.organizationMember.delete({
    where: {
      userId_organizationId: {
        userId,
        organizationId,
      },
    },
  });
}
