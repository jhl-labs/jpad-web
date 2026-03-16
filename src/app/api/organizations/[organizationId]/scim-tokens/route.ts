import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/helpers";
import { checkOrganizationAccess } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";
import { createScimToken, getScimBaseUrl, hashScimToken } from "@/lib/scim";

const createScimTokenSchema = z.object({
  label: z
    .string()
    .min(1, "토큰 이름은 필수입니다")
    .max(100, "토큰 이름은 100자 이하여야 합니다"),
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> }
) {
  try {
    const user = await requireAuth();
    const { organizationId } = await params;
    const member = await checkOrganizationAccess(user.id, organizationId, [
      "owner",
      "admin",
    ]);

    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const tokens = await prisma.organizationScimToken.findMany({
      where: {
        organizationId,
        revokedAt: null,
      },
      select: {
        id: true,
        label: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    return NextResponse.json({
      data: tokens,
      scimBaseUrl: getScimBaseUrl(req),
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> }
) {
  try {
    const user = await requireAuth();
    const { organizationId } = await params;
    const requestContext = getAuditRequestContext(req);
    const member = await checkOrganizationAccess(user.id, organizationId, [
      "owner",
      "admin",
    ]);

    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = createScimTokenSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.errors.map((entry) => entry.message);
      return NextResponse.json({ error: errors[0], errors }, { status: 400 });
    }

    const rawToken = createScimToken();
    const token = await prisma.organizationScimToken.create({
      data: {
        organizationId,
        label: parsed.data.label.trim(),
        tokenHash: hashScimToken(rawToken),
        createdByUserId: user.id,
      },
      select: {
        id: true,
        label: true,
        createdAt: true,
      },
    });

    await recordAuditLog({
      action: "organization.scim_token.created",
      actor: createAuditActor(user, member.role),
      targetId: token.id,
      targetType: "organization_scim_token",
      metadata: {
        organizationId,
        label: token.label,
      },
      context: requestContext,
    });

    return NextResponse.json(
      {
        ...token,
        token: rawToken,
        scimBaseUrl: getScimBaseUrl(req),
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
