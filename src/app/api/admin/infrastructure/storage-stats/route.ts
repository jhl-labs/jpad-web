import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/helpers";
import { getStorageStats } from "@/lib/infrastructureHealth";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";

export async function GET() {
  try {
    const user = await requirePlatformAdmin();

    if (!(await rateLimitRedis(`admin-infra-storage:${user.id}`, 30, 60_000))) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const stats = await getStorageStats();

    return NextResponse.json({ stats }, { status: 200 });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (err instanceof Error && err.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    logError("api.admin.infrastructure.storage-stats", err);
    return NextResponse.json({ error: "Failed to fetch storage statistics" }, { status: 500 });
  }
}
