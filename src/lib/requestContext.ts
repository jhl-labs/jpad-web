import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { extractClientIp } from "@/lib/rateLimit";

type RequestSource = NextRequest | Request | Headers | null | undefined;

export interface RequestContext {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export function getHeaders(source: RequestSource): Headers | null {
  if (!source) return null;
  if (source instanceof Headers) return source;
  if ("headers" in source) return source.headers;
  return null;
}

export function getRequestId(source: RequestSource): string {
  const headers = getHeaders(source);
  return (
    headers?.get("x-request-id") ??
    headers?.get("x-vercel-id") ??
    randomUUID()
  );
}

export function getRequestContext(source: RequestSource): RequestContext {
  const headers = getHeaders(source);

  return {
    requestId: getRequestId(headers),
    ipAddress: extractClientIp(headers) || null,
    userAgent: headers?.get("user-agent") ?? null,
  };
}
