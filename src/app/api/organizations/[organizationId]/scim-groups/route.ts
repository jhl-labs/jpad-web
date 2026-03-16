import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { checkOrganizationAccess } from "@/lib/organizations";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
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

    const [groups, workspaces] = await Promise.all([
      prisma.organizationScimGroup.findMany({
        where: {
          organizationId,
        },
        include: {
          _count: {
            select: {
              members: true,
            },
          },
          workspaceMappings: {
            include: {
              workspace: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          },
        },
        orderBy: [{ displayName: "asc" }, { id: "asc" }],
      }),
      prisma.workspace.findMany({
        where: {
          organizationId,
        },
        select: {
          id: true,
          name: true,
          slug: true,
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      }),
    ]);

    return NextResponse.json({
      data: groups,
      workspaces,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
