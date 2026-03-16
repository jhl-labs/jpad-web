import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requirePlatformAdmin } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    await requirePlatformAdmin();

    const pageParam = req.nextUrl.searchParams.get("page");
    const limitParam = req.nextUrl.searchParams.get("limit");
    const statusParam = req.nextUrl.searchParams.get("status");
    const searchParam = req.nextUrl.searchParams.get("search")?.trim();
    const currentPage = Math.max(1, Number.parseInt(pageParam || "1", 10) || 1);
    const limit = Math.min(50, Math.max(1, Number.parseInt(limitParam || "20", 10) || 20));
    const skip = (currentPage - 1) * limit;

    const status =
      statusParam === "quarantined" ||
      statusParam === "released" ||
      statusParam === "warning"
        ? statusParam
        : "quarantined";

    const where: Prisma.AttachmentWhereInput = {
      ...(status === "quarantined"
        ? {
            securityStatus: "blocked",
            OR: [
              {
                securityDisposition: null,
              },
              {
                securityDisposition: "blocked",
              },
            ],
          }
        : status === "released"
          ? {
              securityStatus: "blocked",
              securityDisposition: "released",
            }
          : {
              securityStatus: {
                in: ["error", "bypassed", "not_scanned"],
              },
            }),
      ...(searchParam
        ? {
            OR: [
              {
                filename: {
                  contains: searchParam,
                  mode: "insensitive",
                },
              },
              {
                page: {
                  title: {
                    contains: searchParam,
                    mode: "insensitive",
                  },
                },
              },
              {
                page: {
                  workspace: {
                    name: {
                      contains: searchParam,
                      mode: "insensitive",
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [attachments, total] = await Promise.all([
      prisma.attachment.findMany({
        where,
        orderBy: [{ securityCheckedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        skip,
        take: limit,
        select: {
          id: true,
          filename: true,
          mimeType: true,
          size: true,
          securityStatus: true,
          securityDisposition: true,
          securityScanner: true,
          securityFindings: true,
          securityCheckedAt: true,
          securityReviewedAt: true,
          securityReviewedByUserId: true,
          securityReviewNote: true,
          createdAt: true,
          page: {
            select: {
              id: true,
              title: true,
              slug: true,
              workspace: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
          },
        },
      }),
      prisma.attachment.count({ where }),
    ]);

    const reviewerIds = Array.from(
      new Set(
        attachments
          .map((attachment) => attachment.securityReviewedByUserId)
          .filter((value): value is string => Boolean(value))
      )
    );

    const reviewers =
      reviewerIds.length > 0
        ? await prisma.user.findMany({
            where: {
              id: {
                in: reviewerIds,
              },
            },
            select: {
              id: true,
              email: true,
              name: true,
            },
          })
        : [];

    const reviewerMap = new Map(reviewers.map((reviewer) => [reviewer.id, reviewer]));

    return NextResponse.json({
      data: attachments.map((attachment) => ({
        id: attachment.id,
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        size: attachment.size,
        securityStatus: attachment.securityStatus,
        securityDisposition: attachment.securityDisposition,
        securityScanner: attachment.securityScanner,
        securityFindings: attachment.securityFindings,
        securityCheckedAt: attachment.securityCheckedAt,
        securityReviewedAt: attachment.securityReviewedAt,
        securityReviewNote: attachment.securityReviewNote,
        createdAt: attachment.createdAt,
        page: attachment.page,
        reviewedBy:
          attachment.securityReviewedByUserId &&
          reviewerMap.has(attachment.securityReviewedByUserId)
            ? reviewerMap.get(attachment.securityReviewedByUserId)
            : null,
      })),
      pagination: {
        page: currentPage,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        status,
        search: searchParam || null,
      },
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      if (error.message === "Forbidden") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    logError("admin.ops.attachments.fetch_failed", error, {}, req);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
