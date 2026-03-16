import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";
import { getVectorStoreRuntimeStatus } from "@/lib/vectorStore";

export async function GET(req: NextRequest) {
  try {
    await requirePlatformAdmin();

    const refresh = req.nextUrl.searchParams.get("refresh") === "1";
    const status = await getVectorStoreRuntimeStatus({
      forceCheck: refresh,
    });

    return NextResponse.json({ status });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (error.message === "Forbidden") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    logError("admin.ops.vector_store_status.fetch_failed", error, {}, req);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
