import { NextRequest, NextResponse } from "next/server";
import {
  createAttachmentSecurityAuditActor,
  getAuditRequestContext,
  rescanAttachmentById,
} from "@/lib/attachmentSecurity";
import { requireAuth } from "@/lib/auth/helpers";
import { getPageAccessContext } from "@/lib/pageAccess";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ pageId: string; attachmentId: string }>;
  }
) {
  try {
    const user = await requireAuth();
    const { pageId, attachmentId } = await params;
    const requestContext = getAuditRequestContext(req);

    const access = await getPageAccessContext(user.id, pageId);
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!access.canEdit) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const attachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: { pageId: true },
    });
    if (!attachment || attachment.pageId !== pageId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await rescanAttachmentById(attachmentId, {
      actor: createAttachmentSecurityAuditActor(
        user,
        access.member?.role ?? null
      ),
      context: requestContext,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Attachment not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
