import { NextRequest, NextResponse } from "next/server";
import { createAuditActor, getAuditRequestContext } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";
import { reblockAttachmentQuarantineById } from "@/lib/attachmentSecurity";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  try {
    const user = await requirePlatformAdmin();

    if (!(await rateLimitRedis(`admin-reblock:${user.id}`, 5, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const { attachmentId } = await params;
    const body = await req.json().catch(() => ({}));

    const result = await reblockAttachmentQuarantineById(attachmentId, {
      actor: createAuditActor(user, "platform_admin"),
      context: getAuditRequestContext(req),
      note:
        typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (error.message === "Forbidden") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (
        error.message === "Attachment not found" ||
        error.message === "Attachment is not quarantined"
      ) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }

    logError("admin.ops.attachments.reblock_failed", error, {}, req);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
