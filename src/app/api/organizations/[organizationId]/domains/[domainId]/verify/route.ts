import { resolveTxt } from "dns/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/helpers";
import {
  buildOrganizationDomainTxtRecord,
  checkOrganizationAccess,
} from "@/lib/organizations";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ organizationId: string; domainId: string }> }
) {
  try {
    const user = await requireAuth();
    const { organizationId, domainId } = await params;
    const requestContext = getAuditRequestContext(req);
    const member = await checkOrganizationAccess(user.id, organizationId, [
      "owner",
      "admin",
    ]);

    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const domain = await prisma.organizationDomain.findUnique({
      where: { id: domainId },
    });
    if (!domain || domain.organizationId !== organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (domain.verifiedAt) {
      return NextResponse.json({ success: true, domain });
    }

    const instructions = buildOrganizationDomainTxtRecord(domain.domain);
    const expectedValue = `${instructions.valuePrefix}${domain.verificationToken}`;

    let resolvedRecords: string[] = [];
    try {
      const txtRecords = await resolveTxt(instructions.name);
      resolvedRecords = txtRecords.flat().map((value) => value.trim());
    } catch {
      return NextResponse.json(
        {
          error: "DNS TXT 레코드를 확인할 수 없습니다.",
          verification: {
            txtRecordName: instructions.name,
            txtRecordValue: expectedValue,
          },
        },
        { status: 400 }
      );
    }

    if (!resolvedRecords.includes(expectedValue)) {
      return NextResponse.json(
        {
          error: "TXT 레코드가 아직 전파되지 않았거나 값이 일치하지 않습니다.",
          verification: {
            txtRecordName: instructions.name,
            txtRecordValue: expectedValue,
          },
        },
        { status: 400 }
      );
    }

    const verifiedDomain = await prisma.organizationDomain.update({
      where: { id: domainId },
      data: {
        verifiedAt: new Date(),
      },
    });

    await recordAuditLog({
      action: "organization.domain.verified",
      actor: createAuditActor(user, member.role),
      targetId: domainId,
      targetType: "organization_domain",
      metadata: {
        organizationId,
        domain: domain.domain,
        autoJoin: domain.autoJoin,
      },
      context: requestContext,
    });

    return NextResponse.json({ success: true, domain: verifiedDomain });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
