import { NextRequest, NextResponse } from "next/server";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { createAuditActor, getAuditRequestContext } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";
import { runTrackedSearchIndexWorker } from "@/lib/semanticIndexWorker";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const user = await requireAuth();

    if (!(await rateLimitRedis(`ai-process-jobs:${user.id}`, 3, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const { workspaceId } = await params;
    const requestContext = getAuditRequestContext(req);
    const body = (await req.json().catch(() => ({}))) as { limit?: number };

    const member = await checkWorkspaceAccess(user.id, workspaceId, ["owner", "admin"]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const limit =
      typeof body.limit === "number" && Number.isInteger(body.limit)
        ? Math.min(100, Math.max(1, body.limit))
        : 20;
    const result = await runTrackedSearchIndexWorker({
      workspaceId,
      limit,
      trigger: "api",
      actor: createAuditActor(user, member.role),
      context: requestContext,
    });

    return NextResponse.json({
      runId: result.runId,
      processedCount: result.summary.processedJobCount,
      successCount: result.summary.successJobCount,
      errorCount: result.summary.errorJobCount,
      workspaceSummary: result.workspaceSummary,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    logError("workspace.ai.index_jobs.process_failed", error, {}, req);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
