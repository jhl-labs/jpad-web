import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { createHmac } from "crypto";
import { getPageAccessContext } from "@/lib/pageAccess";

function signToken(payload: object, secret: string): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
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

    return NextResponse.json({ token });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
