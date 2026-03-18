import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { getPageAccessContext } from "@/lib/pageAccess";
import { isShareLinkActive } from "@/lib/publicAccess";
import { prisma } from "@/lib/prisma";
import { rateLimitRedis } from "@/lib/rateLimit";
import { getEffectiveWorkspaceSettings } from "@/lib/workspaceSettings";
import { logError } from "@/lib/logger";

function buildResponse(
  shareLink: {
    token: string;
    createdAt: Date;
    updatedAt: Date;
    expiresAt: Date | null;
    revokedAt: Date | null;
  } | null
) {
  if (!shareLink || !isShareLinkActive(shareLink)) {
    return { shareLink: null };
  }

  return {
    shareLink: {
      token: shareLink.token,
      createdAt: shareLink.createdAt,
      updatedAt: shareLink.updatedAt,
      expiresAt: shareLink.expiresAt,
    },
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const user = await requireAuth();
    const { pageId } = await params;
    const access = await getPageAccessContext(user.id, pageId);
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!access.canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const page = await prisma.page.findUnique({
      where: { id: pageId },
      select: {
        shareLink: {
          select: {
            token: true,
            createdAt: true,
            updatedAt: true,
            expiresAt: true,
            revokedAt: true,
          },
        },
      },
    });

    return NextResponse.json(buildResponse(page?.shareLink ?? null));
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("pages.share.get.error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const user = await requireAuth();
    const { pageId } = await params;
    const requestContext = getAuditRequestContext(_req);
    const access = await getPageAccessContext(user.id, pageId);
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!access.canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!(await rateLimitRedis(`share-link:${user.id}:${pageId}`, 10, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const settings = await getEffectiveWorkspaceSettings(access.page.workspaceId);
    if (!settings.allowPublicPages) {
      return NextResponse.json(
        { error: "Public page sharing is disabled for this workspace" },
        { status: 403 }
      );
    }

    const token = randomBytes(24).toString("base64url");
    const shareLink = await prisma.pageShareLink.upsert({
      where: { pageId },
      update: {
        token,
        revokedAt: null,
        expiresAt: null,
      },
      create: {
        pageId,
        token,
      },
      select: {
        token: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    await recordAuditLog({
      action: "page.share.created",
      actor: createAuditActor(user, access.member?.role ?? null),
      workspaceId: access.page.workspaceId,
      pageId,
      targetId: pageId,
      targetType: "page",
      metadata: {
        hasExpiry: Boolean(shareLink.expiresAt),
      },
      context: requestContext,
    });

    return NextResponse.json(buildResponse(shareLink), { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("pages.share.post.error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const user = await requireAuth();
    const { pageId } = await params;
    const requestContext = getAuditRequestContext(_req);
    const access = await getPageAccessContext(user.id, pageId);
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!access.canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.pageShareLink.updateMany({
      where: { pageId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await recordAuditLog({
      action: "page.share.revoked",
      actor: createAuditActor(user, access.member?.role ?? null),
      workspaceId: access.page.workspaceId,
      pageId,
      targetId: pageId,
      targetType: "page",
      context: requestContext,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("pages.share.delete.error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
