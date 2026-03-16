import { NextRequest, NextResponse } from "next/server";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";
import { reindexWorkspaceEmbeddings } from "@/lib/semanticSearch";
import {
  enqueueWorkspaceReindexJob,
  triggerBestEffortSearchIndexProcessing,
} from "@/lib/semanticIndexQueue";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const user = await requireAuth();

    if (!(await rateLimitRedis(`ai-reindex:${user.id}`, 3, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const { workspaceId } = await params;
    const requestContext = getAuditRequestContext(req);
    const body = (await req.json().catch(() => ({}))) as {
      dryRun?: boolean;
      limit?: number;
    };

    const member = await checkWorkspaceAccess(user.id, workspaceId, ["owner", "admin"]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const limit =
      typeof body.limit === "number" && Number.isInteger(body.limit)
        ? Math.min(500, Math.max(1, body.limit))
        : undefined;
    if (body.dryRun === true) {
      const summary = await reindexWorkspaceEmbeddings(workspaceId, {
        dryRun: true,
        limit,
      });

      await recordAuditLog({
        action: "search.reindex.executed",
        actor: createAuditActor(user, member.role),
        workspaceId,
        targetType: "semantic_index",
        metadata: JSON.parse(
          JSON.stringify({
            mode: "dry_run",
            limit: limit || null,
            summary,
          })
        ),
        context: requestContext,
      });

      return NextResponse.json({ summary });
    }

    const job = await enqueueWorkspaceReindexJob({ workspaceId, limit });
    triggerBestEffortSearchIndexProcessing(workspaceId);

    await recordAuditLog({
      action: "search.reindex.executed",
      actor: createAuditActor(user, member.role),
      workspaceId,
      targetType: "semantic_index",
      metadata: JSON.parse(
        JSON.stringify({
          mode: "queued",
          limit: limit || null,
          jobId: job.id,
          jobStatus: job.status,
        })
      ),
      context: requestContext,
    });

    return NextResponse.json({
      queued: true,
      job: {
        id: job.id,
        status: job.status,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    logError("workspace.ai.reindex.failed", error, {}, req);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
