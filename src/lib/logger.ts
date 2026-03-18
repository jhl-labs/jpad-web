import { NextRequest } from "next/server";
import { getRequestContext } from "@/lib/requestContext";

type LogLevel = "info" | "warn" | "error";
type RequestSource = NextRequest | Request | Headers | null | undefined;

interface LogFields {
  [key: string]: unknown;
}

function serializeError(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    };
  }

  return { error: String(error) };
}

function writeLog(level: LogLevel, event: string, fields: LogFields) {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  });

  if (level === "error") {
    console.error(payload);
    return;
  }
  if (level === "warn") {
    console.warn(payload);
    return;
  }
  console.log(payload);
}

export function logInfo(
  event: string,
  fields: LogFields = {},
  source?: RequestSource
) {
  const context = getRequestContext(source);
  writeLog("info", event, {
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    ...fields,
  });
}

export function logWarn(
  event: string,
  message: string,
  fields: LogFields = {},
  source?: RequestSource
) {
  const context = getRequestContext(source);
  writeLog("warn", event, {
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    message,
    ...fields,
  });
}

export function logRequest(
  event: string,
  req: { method?: string; url?: string },
  meta?: Record<string, unknown>
) {
  const url = req.url ? new URL(req.url).pathname : "unknown";
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      event,
      method: req.method || "GET",
      path: url,
      ...meta,
    })
  );
}

export function logError(
  event: string,
  error: unknown,
  fields: LogFields = {},
  source?: RequestSource
) {
  const context = getRequestContext(source);
  writeLog("error", event, {
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    ...fields,
    ...serializeError(error),
  });
}
