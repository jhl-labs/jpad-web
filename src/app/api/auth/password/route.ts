import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/helpers";
import { rateLimitRedis } from "@/lib/rateLimit";
import { logError } from "@/lib/logger";
import {
  recordAuditLog,
  createAuditActor,
} from "@/lib/audit";

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireAuth();

    if (!(await rateLimitRedis(`password-change:${user.id}`, 5, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const parsed = passwordSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((e) => e.message);
      return NextResponse.json({ error: errors[0], errors }, { status: 400 });
    }

    const { currentPassword, newPassword } = parsed.data;

    // Password strength validation
    const hasUppercase = /[A-Z]/.test(newPassword);
    const hasLowercase = /[a-z]/.test(newPassword);
    const hasNumber = /[0-9]/.test(newPassword);
    const hasSpecial = /[!@#$%^&*()_+\-=]/.test(newPassword);
    if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
      return NextResponse.json(
        { error: "Password must contain uppercase, lowercase, number, and special character" },
        { status: 400 }
      );
    }

    // Fetch user with hashedPassword
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, name: true, hashedPassword: true },
    });

    if (!dbUser || !dbUser.hashedPassword) {
      return NextResponse.json(
        { error: "Password login is not configured for this account" },
        { status: 400 }
      );
    }

    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, dbUser.hashedPassword);
    if (!isValid) {
      await recordAuditLog({
        action: "password.change_failed",
        status: "denied",
        actor: createAuditActor(dbUser),
        metadata: { reason: "invalid_current_password" },
      });
      return NextResponse.json(
        { error: "Current password is incorrect" },
        { status: 400 }
      );
    }

    // Hash and save new password
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { hashedPassword },
    });

    await recordAuditLog({
      action: "password.changed",
      status: "success",
      actor: createAuditActor(dbUser),
    });

    return NextResponse.json({ message: "Password changed successfully" });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("password-change", error instanceof Error ? error : new Error(String(error)));
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
