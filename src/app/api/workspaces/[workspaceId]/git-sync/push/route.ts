import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";
import { pushToRemote } from "@/lib/git/remote";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const user = await requireAuth();
    const { workspaceId } = await params;
    const requestContext = getAuditRequestContext(req);

    const member = await checkWorkspaceAccess(user.id, workspaceId, [
      "owner",
      "admin",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const allowed = await rateLimitRedis(`git-sync:push:${user.id}`, 10, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const settings = await prisma.workspaceSettings.findUnique({
      where: { workspaceId },
    });

    if (!settings?.gitRemoteUrl) {
      return NextResponse.json(
        { error: "Git remote URL not configured" },
        { status: 400 }
      );
    }

    if (!settings.gitSyncEnabled) {
      return NextResponse.json(
        { error: "Git sync is not enabled" },
        { status: 400 }
      );
    }

    const syncMode = settings.gitSyncMode || "push_only";
    if (syncMode === "pull_only") {
      return NextResponse.json(
        { error: "Sync mode is set to pull_only" },
        { status: 400 }
      );
    }

    const logEntry = await prisma.gitSyncLog.create({
      data: {
        workspaceId,
        direction: "push",
        trigger: "manual",
        status: "running",
      },
    });

    try {
      const result = await pushToRemote(workspaceId, {
        gitRemoteUrl: settings.gitRemoteUrl,
        gitRemoteToken: settings.gitRemoteToken,
        gitRemoteBranch: settings.gitRemoteBranch || "main",
        gitSyncMode: settings.gitSyncMode,
      });

      await prisma.gitSyncLog.update({
        where: { id: logEntry.id },
        data: {
          status: "success",
          filesChanged: result.filesChanged,
          finishedAt: new Date(),
        },
      });

      await recordAuditLog({
        action: "workspace.git_sync.push",
        actor: createAuditActor(user, member.role),
        workspaceId,
        targetId: workspaceId,
        targetType: "workspace",
        metadata: { trigger: "manual", filesChanged: result.filesChanged },
        context: requestContext,
      });

      return NextResponse.json({
        status: "success",
        filesChanged: result.filesChanged,
        logId: logEntry.id,
      });
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown push error";

      await prisma.gitSyncLog.update({
        where: { id: logEntry.id },
        data: {
          status: "error",
          errorMessage,
          finishedAt: new Date(),
        },
      });

      return NextResponse.json(
        { error: `Push failed: ${errorMessage}`, logId: logEntry.id },
        { status: 500 }
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("git_sync.push.unhandled_error", error, {}, req);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
