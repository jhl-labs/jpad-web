import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { rateLimitRedis } from "@/lib/rateLimit";
import { createHmac } from "crypto";
import { getPageAccessContext } from "@/lib/pageAccess";
import { logError } from "@/lib/logger";

function signToken(payload: object, secret: string): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();

    if (!(await rateLimitRedis(`ws-token:${user.id}`, 20, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const { workspaceId, pageId } = await req.json();

    if (!workspaceId || !pageId) {
      return NextResponse.json(
        { error: "workspaceId and pageId required" },
        { status: 400 }
      );
    }

    const access = await getPageAccessContext(user.id, pageId);
    if (!access || access.page.workspaceId !== workspaceId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!access.canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const secret = process.env.WS_SECRET ?? process.env.NEXTAUTH_SECRET;
    if (!secret) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const tokenPayload = {
      userId: user.id,
      workspaceId,
      pageId,
      canEdit: access.canEdit,
      timestamp: Date.now(),
    };

    const token = signToken(tokenPayload, secret);

    const wsUrl = process.env.WS_URL || "ws://localhost:1234";

    return NextResponse.json({ token, wsUrl });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("ws-token.post.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
