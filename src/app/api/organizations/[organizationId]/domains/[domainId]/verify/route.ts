import { resolveTxt } from "dns/promises";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/helpers";
import {
  buildOrganizationDomainTxtRecord,
  checkOrganizationAccess,
} from "@/lib/organizations";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ organizationId: string; domainId: string }> }
) {
  try {
    const user = await requireAuth();

    if (!(await rateLimitRedis(`org-domain-verify:${user.id}`, 20, 60_000))) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please wait a moment." },
        { status: 429 }
      );
    }

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
    } catch (error) {
      logError("organization.domain.dns_resolve_failed", error, { domainId });
      return NextResponse.json(
        {
          error: "DNS TXT record not found",
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
          error: "TXT record not yet propagated or value mismatch",
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
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("organization.domain.verify_failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
