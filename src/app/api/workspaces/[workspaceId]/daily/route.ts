import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { logError } from "@/lib/logger";
import { rateLimitRedis } from "@/lib/rateLimit";
import { initRepo, savePage } from "@/lib/git/repository";

const DAY_NAMES = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

function formatDailyTitle(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  const dayName = DAY_NAMES[date.getDay()];
  return `${dateStr} ${dayName}`;
}

function getDefaultContent(): string {
  return `## 오늘의 할 일\n- [ ] \n\n## 메모\n\n\n## 회고\n\n`;
}

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

    // date 파라미터 (기본: 오늘)
    const dateParam = req.nextUrl.searchParams.get("date");
    const dateStr = dateParam || new Date().toISOString().split("T")[0];

    // 날짜 형식 검증
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json(
        { error: "Invalid date format. Use YYYY-MM-DD" },
        { status: 400 }
      );
    }

    // 실제 유효한 날짜인지 검증 (예: 2024-02-30 같은 잘못된 날짜 방지)
    if (isNaN(new Date(dateStr + "T00:00:00").getTime())) {
      return NextResponse.json(
        { error: "Invalid date value" },
        { status: 400 }
      );
    }

    const allowed = await rateLimitRedis(`daily:${user.id}`, 30, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const slug = `daily/${dateStr}`;

    // 기존 데일리 노트 찾기
    let page = await prisma.page.findFirst({
      where: { workspaceId, slug, isDeleted: false },
    });

    if (page) {
      return NextResponse.json(page);
    }

    // viewer는 생성 불가
    if (member.role === "viewer") {
      return NextResponse.json(
        { error: "Daily note not found" },
        { status: 404 }
      );
    }

    // 자동 생성: DB 먼저 생성 후 git 저장 (DB 실패 시 git 파일이 남지 않도록)
    const title = formatDailyTitle(dateStr);
    const content = getDefaultContent();

    // position 계산
    const maxPos = await prisma.page.aggregate({
      where: { workspaceId, parentId: null },
      _max: { position: true },
    });

    try {
      page = await prisma.page.create({
        data: {
          title,
          slug,
          workspaceId,
          parentId: null,
          position: (maxPos._max.position || 0) + 1,
          icon: "📓",
        },
      });
    } catch (createError: unknown) {
      // 동시 요청으로 unique constraint 위반 시 기존 레코드 반환
      if (
        typeof createError === "object" &&
        createError !== null &&
        "code" in createError &&
        (createError as { code: string }).code === "P2002"
      ) {
        const existing = await prisma.page.findFirst({
          where: { workspaceId, slug, isDeleted: false },
        });
        if (existing) {
          return NextResponse.json(existing);
        }
      }
      throw createError;
    }

    try {
      // git에 초기 내용 저장
      await initRepo(workspaceId);
      await savePage(
        workspaceId,
        slug,
        `# ${title}\n\n${content}`,
        user.name,
        `Create daily note: ${title}`
      );
    } catch (gitError) {
      // git 저장 실패 시 DB 레코드 롤백
      await prisma.page.delete({ where: { id: page.id } });
      throw gitError;
    }

    return NextResponse.json(page, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    logError("daily.get.unhandled_error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
