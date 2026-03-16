import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logger";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        status: "ok",
        version: "1.0.0",
        uptime: process.uptime(),
      },
      { status: 200 }
    );
  } catch (err) {
    logError("health.check.failed", err);
    return NextResponse.json(
      {
        status: "error",
        error: "Database connection failed",
      },
      { status: 503 }
    );
  }
}
