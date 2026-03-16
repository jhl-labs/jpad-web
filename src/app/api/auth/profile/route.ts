import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/helpers";
import { rateLimitRedis } from "@/lib/rateLimit";
import { logError } from "@/lib/logger";
import { z } from "zod";

export async function GET() {
  try {
    const user = await requireAuth();
    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("profile.get.error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

const updateSchema = z.object({
  name: z
    .string()
    .min(1, "이름은 필수입니다")
    .max(100, "이름은 100자 이하여야 합니다"),
});

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth();

    if (!(await rateLimitRedis(`profile-update:${user.id}`, 10, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const body = await req.json();

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((e) => e.message);
      return NextResponse.json({ error: errors[0], errors }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { name: parsed.data.name },
      select: { id: true, name: true, email: true, createdAt: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("profile.patch.error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
