import { NextResponse } from "next/server";
import { logError } from "@/lib/logger";
import { AiError } from "@/lib/ai";

export function handleApiError(error: unknown, context: string): NextResponse {
  if (error instanceof Error && error.message === "Unauthorized") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (error instanceof AiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  logError(context, error);
  return NextResponse.json({ error: "Server error" }, { status: 500 });
}
