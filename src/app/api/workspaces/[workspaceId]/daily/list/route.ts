import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const user = await requireAuth();
    const { workspaceId } = await params;

    const member = await checkWorkspaceAccess(user.id, workspaceId, [
      "owner",
      "admin",
      "maintainer",
      "editor",
      "viewer",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // month 파라미터 (YYYY-MM)
    const monthParam = req.nextUrl.searchParams.get("month");
    if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
      return NextResponse.json(
        { error: "Invalid month format. Use YYYY-MM" },
        { status: 400 }
      );
    }

    // daily/ 프리픽스로 시작하는 slug를 가진 페이지들 검색
    const pages = await prisma.page.findMany({
      where: {
        workspaceId,
        slug: { startsWith: `daily/${monthParam}` },
        isDeleted: false,
      },
      select: { slug: true },
      orderBy: { slug: "asc" },
    });

    // slug에서 날짜만 추출
    const dates = pages.map((p) => p.slug.replace("daily/", ""));

    return NextResponse.json({ dates });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
