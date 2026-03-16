import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { extractClientIp, rateLimitRedis } from "@/lib/rateLimit";
import { logError } from "@/lib/logger";
import { z } from "zod";
import {
  isSelfSignupEnabled,
  normalizeEmailAddress,
} from "@/lib/auth/config";

const registerSchema = z.object({
  email: z.string().email("유효한 이메일 형식이 아닙니다"),
  password: z.string().min(8, "비밀번호는 최소 8자 이상이어야 합니다"),
  name: z
    .string()
    .min(1, "이름은 필수입니다")
    .max(100, "이름은 100자 이하여야 합니다"),
});

export async function POST(req: NextRequest) {
  try {
    if (!isSelfSignupEnabled()) {
      return NextResponse.json(
        { error: "Self-service sign-up is disabled" },
        { status: 403 }
      );
    }

    // Rate limiting: 5 requests per minute per IP
    const ip = extractClientIp(req.headers);
    if (!(await rateLimitRedis(`register:${ip}`, 5, 60_000))) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const body = await req.json();

    // Zod validation
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.errors.map((e) => e.message);
      return NextResponse.json({ error: errors[0], errors }, { status: 400 });
    }

    const email = normalizeEmailAddress(parsed.data.email);
    const { password, name } = parsed.data;

    const existing = await prisma.user.findMany({
      where: {
        email: {
          equals: email,
          mode: "insensitive",
        },
      },
      take: 2,
    });
    if (existing.length > 0) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { email, name, hashedPassword },
      select: { id: true, email: true, name: true },
    });

    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    logError("auth.register.failed", error, {}, req);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
