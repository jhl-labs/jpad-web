import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { markAllAsRead } from "@/lib/notifications";

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();

    const body = await req.json().catch(() => ({}));
    const workspaceId = body.workspaceId as string | undefined;

    const result = await markAllAsRead(user.id, workspaceId);

    return NextResponse.json({ success: true, count: result.count });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
