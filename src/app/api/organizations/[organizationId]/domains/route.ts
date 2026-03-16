import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/helpers";
import {
  buildOrganizationDomainTxtRecord,
  checkOrganizationAccess,
  generateOrganizationDomainVerificationToken,
  normalizeOrganizationDomain,
} from "@/lib/organizations";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";

const createDomainSchema = z.object({
  domain: z.string().min(1, "도메인은 필수입니다").max(255, "도메인이 너무 깁니다"),
  autoJoin: z.boolean().optional(),
});

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
    const parsed = createDomainSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((entry) => entry.message);
      return NextResponse.json({ error: errors[0], errors }, { status: 400 });
    }

    const normalizedDomain = normalizeOrganizationDomain(parsed.data.domain);
    const existing = await prisma.organizationDomain.findUnique({
      where: { domain: normalizedDomain },
    });

    if (existing) {
      return NextResponse.json(
        { error: "이 도메인은 이미 다른 조직에서 사용 중입니다." },
        { status: 409 }
      );
    }

    const verificationToken = generateOrganizationDomainVerificationToken();
    const instructions = buildOrganizationDomainTxtRecord(normalizedDomain);
    const domain = await prisma.organizationDomain.create({
      data: {
        organizationId,
        domain: normalizedDomain,
        autoJoin: parsed.data.autoJoin ?? false,
        verificationToken,
      },
    });

    await recordAuditLog({
      action: "organization.domain.added",
      actor: createAuditActor(user, member.role),
      targetId: domain.id,
      targetType: "organization_domain",
      metadata: {
        organizationId,
        domain: domain.domain,
        autoJoin: domain.autoJoin,
      },
      context: requestContext,
    });

    return NextResponse.json(
      {
        ...domain,
        verification: {
          txtRecordName: instructions.name,
          txtRecordValue: `${instructions.valuePrefix}${verificationToken}`,
        },
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
