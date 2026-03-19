import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { encryptSecret, SecretEncryptionError } from "@/lib/secrets";
import { rateLimitRedis } from "@/lib/rateLimit";

const SECRET_MASK = "••••••••";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const user = await requireAuth();
    const { workspaceId } = await params;

    const member = await checkWorkspaceAccess(user.id, workspaceId, [
      "owner",
      "admin",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const settings = await prisma.workspaceSettings.findUnique({
      where: { workspaceId },
    });

    return NextResponse.json({
      gitRemoteUrl: settings?.gitRemoteUrl || null,
      gitRemoteToken: settings?.gitRemoteToken ? SECRET_MASK : null,
      gitRemoteBranch: settings?.gitRemoteBranch || "main",
      gitSyncMode: settings?.gitSyncMode || null,
      gitSyncEnabled: settings?.gitSyncEnabled || false,
      gitAutoSyncOnSave: settings?.gitAutoSyncOnSave ?? true,
      gitWebhookSecret: settings?.gitWebhookSecret ? SECRET_MASK : null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("git_sync.get.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(
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

    const allowed = await rateLimitRedis(`git-sync:patch:${user.id}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const updateData: Record<string, unknown> = {};
    const updatedFields: string[] = [];
    let secretFieldsChanged = false;

    if ("gitRemoteUrl" in body) {
      if (
        body.gitRemoteUrl !== null &&
        (typeof body.gitRemoteUrl !== "string" || !body.gitRemoteUrl.trim())
      ) {
        return NextResponse.json(
          { error: "gitRemoteUrl must be a non-empty string or null" },
          { status: 400 }
        );
      }
      updateData.gitRemoteUrl = body.gitRemoteUrl?.trim() || null;
      updatedFields.push("gitRemoteUrl");
    }

    if ("gitRemoteToken" in body) {
      if (member.role !== "owner") {
        return NextResponse.json(
          { error: "Only owners can update git remote token" },
          { status: 403 }
        );
      }
      if (body.gitRemoteToken === null || body.gitRemoteToken === "") {
        updateData.gitRemoteToken = null;
      } else if (typeof body.gitRemoteToken === "string") {
        if (body.gitRemoteToken !== SECRET_MASK) {
          updateData.gitRemoteToken = encryptSecret(body.gitRemoteToken.trim());
          secretFieldsChanged = true;
        }
      } else {
        return NextResponse.json(
          { error: "gitRemoteToken must be a string or null" },
          { status: 400 }
        );
      }
      updatedFields.push("gitRemoteToken");
    }

    if ("gitRemoteBranch" in body) {
      if (typeof body.gitRemoteBranch !== "string" || !body.gitRemoteBranch.trim()) {
        return NextResponse.json(
          { error: "gitRemoteBranch must be a non-empty string" },
          { status: 400 }
        );
      }
      updateData.gitRemoteBranch = body.gitRemoteBranch.trim();
      updatedFields.push("gitRemoteBranch");
    }

    if ("gitSyncMode" in body) {
      if (
        body.gitSyncMode !== null &&
        !["push_only", "pull_only", "bidirectional"].includes(body.gitSyncMode)
      ) {
        return NextResponse.json(
          { error: "gitSyncMode must be push_only, pull_only, or bidirectional" },
          { status: 400 }
        );
      }
      updateData.gitSyncMode = body.gitSyncMode || null;
      updatedFields.push("gitSyncMode");
    }

    if ("gitSyncEnabled" in body) {
      if (typeof body.gitSyncEnabled !== "boolean") {
        return NextResponse.json(
          { error: "gitSyncEnabled must be a boolean" },
          { status: 400 }
        );
      }
      updateData.gitSyncEnabled = body.gitSyncEnabled;
      updatedFields.push("gitSyncEnabled");
    }

    if ("gitAutoSyncOnSave" in body) {
      if (typeof body.gitAutoSyncOnSave !== "boolean") {
        return NextResponse.json(
          { error: "gitAutoSyncOnSave must be a boolean" },
          { status: 400 }
        );
      }
      updateData.gitAutoSyncOnSave = body.gitAutoSyncOnSave;
      updatedFields.push("gitAutoSyncOnSave");
    }

    if ("gitWebhookSecret" in body) {
      if (member.role !== "owner") {
        return NextResponse.json(
          { error: "Only owners can update webhook secret" },
          { status: 403 }
        );
      }
      if (body.gitWebhookSecret === null || body.gitWebhookSecret === "") {
        updateData.gitWebhookSecret = null;
      } else if (typeof body.gitWebhookSecret === "string") {
        if (body.gitWebhookSecret !== SECRET_MASK) {
          updateData.gitWebhookSecret = encryptSecret(body.gitWebhookSecret.trim());
          secretFieldsChanged = true;
        }
      } else {
        return NextResponse.json(
          { error: "gitWebhookSecret must be a string or null" },
          { status: 400 }
        );
      }
      updatedFields.push("gitWebhookSecret");
    }

    await prisma.workspaceSettings.upsert({
      where: { workspaceId },
      create: { workspaceId, ...updateData },
      update: updateData,
    });

    if (updatedFields.length > 0) {
      await recordAuditLog({
        action: "workspace.git_sync.settings_updated",
        actor: createAuditActor(user, member.role),
        workspaceId,
        targetId: workspaceId,
        targetType: "workspace",
        metadata: {
          updatedFields: updatedFields.filter(
            (f) => f !== "gitRemoteToken" && f !== "gitWebhookSecret"
          ),
          secretFieldsChanged,
        },
        context: requestContext,
      });
    }

    const updated = await prisma.workspaceSettings.findUnique({
      where: { workspaceId },
    });

    return NextResponse.json({
      gitRemoteUrl: updated?.gitRemoteUrl || null,
      gitRemoteToken: updated?.gitRemoteToken ? SECRET_MASK : null,
      gitRemoteBranch: updated?.gitRemoteBranch || "main",
      gitSyncMode: updated?.gitSyncMode || null,
      gitSyncEnabled: updated?.gitSyncEnabled || false,
      gitAutoSyncOnSave: updated?.gitAutoSyncOnSave ?? true,
      gitWebhookSecret: updated?.gitWebhookSecret ? SECRET_MASK : null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof SecretEncryptionError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    logError("git_sync.patch.unhandled_error", error, {}, req);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
