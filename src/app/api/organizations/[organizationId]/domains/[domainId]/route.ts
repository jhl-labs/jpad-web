import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/helpers";
import { checkOrganizationAccess } from "@/lib/organizations";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ organizationId: string; domainId: string }> }
) {
  try {
    const user = await requireAuth();

    if (!(await rateLimitRedis(`org-domain-delete:${user.id}`, 10, 60_000))) {
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

    await prisma.organizationDomain.delete({
      where: { id: domainId },
    });

    await recordAuditLog({
      action: "organization.domain.removed",
      actor: createAuditActor(user, member.role),
      targetId: domainId,
      targetType: "organization_domain",
      metadata: {
        organizationId,
        domain: domain.domain,
      },
      context: requestContext,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("organization.domain.delete_failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
