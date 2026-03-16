import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { readPage } from "@/lib/git/repository";
import { getPageAccessContext } from "@/lib/pageAccess";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const user = await requireAuth();
    const { pageId } = await params;

    const access = await getPageAccessContext(user.id, pageId);
    if (!access) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!access.canView) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const content = await readPage(access.page.workspaceId, access.page.slug);
    const body = content || `# ${access.page.title}\n`;

    // Build YAML frontmatter
    const frontmatter = [
      "---",
      `title: "${access.page.title.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`,
      `date: "${new Date().toISOString()}"`,
      `author: "${(user.name || "").replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`,
      "---",
      "",
    ].join("\n");

    const markdown = frontmatter + body;
    const filename = `${access.page.title}.md`;

    return new NextResponse(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
