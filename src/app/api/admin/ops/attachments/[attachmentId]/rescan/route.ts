import { NextRequest, NextResponse } from "next/server";
import { getAuditRequestContext } from "@/lib/audit";
import { requirePlatformAdmin } from "@/lib/auth/helpers";
import {
  createAttachmentSecurityAuditActor,
  rescanAttachmentById,
} from "@/lib/attachmentSecurity";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> }
) {
  try {
    const user = await requirePlatformAdmin();

    if (!(await rateLimitRedis(`admin-rescan:${user.id}`, 5, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const { attachmentId } = await params;

    const result = await rescanAttachmentById(attachmentId, {
      actor: createAttachmentSecurityAuditActor(user, "platform_admin"),
      context: getAuditRequestContext(req),
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
      if (error.message === "Attachment not found") {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
    }

    logError("admin.ops.attachments.rescan_failed", error, {}, req);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
