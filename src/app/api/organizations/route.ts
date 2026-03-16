import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth/helpers";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { slugify } from "@/lib/utils";

const createOrganizationSchema = z.object({
  name: z
    .string()
    .min(1, "조직 이름은 필수입니다")
    .max(100, "조직 이름은 100자 이하여야 합니다"),
  description: z.string().max(500).optional(),
});

function buildOrganizationListArgs(userId: string) {
  return Prisma.validator<Prisma.OrganizationDefaultArgs>()({
    include: {
      members: {
        where: { userId },
        select: { role: true },
      },
      domains: {
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      },
      workspaces: {
        select: {
          id: true,
          name: true,
          slug: true,
          visibility: true,
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: 5,
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
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const pageParam = req.nextUrl.searchParams.get("page");
    const limitParam = req.nextUrl.searchParams.get("limit");

    const where = {
      members: {
        some: {
          userId: user.id,
        },
      },
    };
    const args = buildOrganizationListArgs(user.id);

    if (!pageParam) {
      const organizations = await prisma.organization.findMany({
        where,
        include: args.include,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      });

      return NextResponse.json(
        organizations.map((organization) => ({
          ...organization,
          currentRole: organization.members[0]?.role || null,
        }))
      );
    }

    const page = Math.max(1, Number.parseInt(pageParam || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(limitParam || "20", 10) || 20));
    const skip = (page - 1) * limit;

    const [organizations, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        include: args.include,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
      }),
      prisma.organization.count({ where }),
    ]);

    return NextResponse.json({
      data: organizations.map((organization) => ({
        ...organization,
        currentRole: organization.members[0]?.role || null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth();
    const requestContext = getAuditRequestContext(req);
    const body = await req.json();
    const parsed = createOrganizationSchema.safeParse(body);

    if (!parsed.success) {
      const errors = parsed.error.errors.map((entry) => entry.message);
      return NextResponse.json({ error: errors[0], errors }, { status: 400 });
    }

    const { name, description } = parsed.data;
    let slug = slugify(name);
    if (!slug) slug = "organization";

    const existing = await prisma.organization.findUnique({ where: { slug } });
    if (existing) {
      slug = `${slug}-${Date.now().toString(36)}`;
    }

    const organization = await prisma.organization.create({
      data: {
        name,
        slug,
        description: description || null,
        members: {
          create: {
            userId: user.id,
            role: "owner",
          },
        },
      },
      include: {
        domains: true,
        workspaces: {
          select: {
            id: true,
            name: true,
            slug: true,
            visibility: true,
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

    await recordAuditLog({
      action: "organization.created",
      actor: createAuditActor(user, "owner"),
      targetId: organization.id,
      targetType: "organization",
      metadata: {
        slug: organization.slug,
      },
      context: requestContext,
    });

    return NextResponse.json(
      {
        ...organization,
        currentRole: "owner",
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
