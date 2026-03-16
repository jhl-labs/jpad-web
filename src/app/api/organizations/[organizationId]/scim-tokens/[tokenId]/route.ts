import { NextRequest, NextResponse } from "next/server";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { requireAuth } from "@/lib/auth/helpers";
import { checkOrganizationAccess } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ organizationId: string; tokenId: string }> }
) {
  try {
    const user = await requireAuth();
    const { organizationId, tokenId } = await params;
    const requestContext = getAuditRequestContext(req);
    const member = await checkOrganizationAccess(user.id, organizationId, [
      "owner",
      "admin",
    ]);

    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const token = await prisma.organizationScimToken.findFirst({
      where: {
        id: tokenId,
        organizationId,
        revokedAt: null,
      },
      select: {
        id: true,
        label: true,
      },
    });

    if (!token) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.organizationScimToken.update({
      where: { id: tokenId },
      data: {
        revokedAt: new Date(),
      },
    });

    await recordAuditLog({
      action: "organization.scim_token.revoked",
      actor: createAuditActor(user, member.role),
      targetId: token.id,
      targetType: "organization_scim_token",
      metadata: {
        organizationId,
        label: token.label,
      },
      context: requestContext,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
