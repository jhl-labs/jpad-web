import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/helpers";
import {
  canManageOrganization,
  checkOrganizationAccess,
} from "@/lib/organizations";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";

const updateOrganizationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ organizationId: string }> }
) {
  try {
    const user = await requireAuth();
    const { organizationId } = await params;
    const member = await checkOrganizationAccess(user.id, organizationId);

    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        domains: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        },
        workspaces: {
          select: {
            id: true,
            name: true,
            slug: true,
            visibility: true,
            updatedAt: true,
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        },
        members: canManageOrganization(member.role)
          ? {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
              orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            }
          : {
              where: { userId: user.id },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
        _count: {
          select: {
            workspaces: true,
            domains: true,
            members: true,
          },
        },
      },
    });

    if (!organization) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...organization,
      currentRole: member.role,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(
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
    const parsed = updateOrganizationSchema.safeParse(body);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((entry) => entry.message);
      return NextResponse.json({ error: errors[0], errors }, { status: 400 });
    }

    const updateData: { name?: string; description?: string | null } = {};
    if (typeof parsed.data.name === "string") updateData.name = parsed.data.name;
    if ("description" in parsed.data) updateData.description = parsed.data.description ?? null;

    const organization = await prisma.organization.update({
      where: { id: organizationId },
      data: updateData,
    });

    await recordAuditLog({
      action: "organization.updated",
      actor: createAuditActor(user, member.role),
      targetId: organizationId,
      targetType: "organization",
      metadata: {
        updatedFields: Object.keys(updateData),
      },
      context: requestContext,
    });

    return NextResponse.json(organization);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
