import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/helpers";
import { isAttachmentQuarantined } from "@/lib/attachmentSecurity";
import { isShareLinkActive } from "@/lib/publicAccess";
import { getPageAccessContext } from "@/lib/pageAccess";
import { getFile } from "@/lib/storage";
import { logError } from "@/lib/logger";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  try {
    const { attachmentId } = await params;

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        page: {
          select: {
            id: true,
            workspaceId: true,
            isDeleted: true,
            accessMode: true,
            workspace: {
              select: {
                publicWikiEnabled: true,
                settings: {
                  select: {
                    allowPublicPages: true,
                  },
                },
              },
            },
            shareLink: {
              select: {
                expiresAt: true,
                revokedAt: true,
              },
            },
          },
        },
      },
    });

    if (!attachment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (
      isAttachmentQuarantined(
        attachment.securityStatus,
        attachment.securityDisposition
      )
    ) {
      return NextResponse.json(
        { error: "Attachment quarantined" },
        { status: 423 }
      );
    }

    const user = await getCurrentUser();
    let canAccess = false;

    if (user) {
      const access = await getPageAccessContext(user.id, attachment.page.id);
      canAccess = Boolean(access?.canView);
    }

    if (!canAccess) {
      canAccess =
        !attachment.page.isDeleted &&
        ((attachment.page.accessMode === "workspace" &&
          attachment.page.workspace.publicWikiEnabled) ||
          (attachment.page.workspace.settings?.allowPublicPages !== false &&
            isShareLinkActive(attachment.page.shareLink)));
    }

    if (!canAccess) {
      return NextResponse.json(
        { error: user ? "Forbidden" : "Unauthorized" },
        { status: user ? 403 : 401 }
      );
    }

    const file = await getFile(
      attachment.path,
      attachment.storage || "local"
    );
    if (!file) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const isInline =
      attachment.mimeType.startsWith("image/") &&
      attachment.mimeType !== "image/svg+xml";
    // HTTP Response Splitting 방어: filename에서 특수문자 제거
    const safeFilename = attachment.filename
      .replace(/["\r\n;\\]/g, "")
      .trim() || "download";
    const disposition = isInline
      ? `inline; filename="${safeFilename}"`
      : `attachment; filename="${safeFilename}"`;

    const cacheControl = isInline
      ? "private, max-age=31536000, immutable"
      : "private, max-age=3600";

    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.contentType || attachment.mimeType,
        "Content-Disposition": disposition,
        "Cache-Control": cacheControl,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("upload.get.error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
