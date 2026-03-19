import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { ReadOnlyDocument } from "@/components/public/ReadOnlyDocument";
import { readPage } from "@/lib/git/repository";
import { markdownToHtml } from "@/lib/markdown/serializer";
import { getActiveShareLinkByToken } from "@/lib/publicAccess";
import { rateLimitRedis } from "@/lib/rateLimit";
import { rewriteWikiLinksForMarkdown } from "@/lib/wikiLinks";

export default async function SharedPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const headersList = await headers();
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const allowed = await rateLimitRedis(`share:${ip}`, 30, 60_000);
  if (!allowed) {
    return <div>요청이 너무 많습니다. 잠시 후 다시 시도해주세요.</div>;
  }

  const shareLink = await getActiveShareLinkByToken(token);

  if (!shareLink) notFound();

  const content = await readPage(
    shareLink.page.workspaceId,
    shareLink.page.slug
  );
  const html = await markdownToHtml(
    rewriteWikiLinksForMarkdown(
      content || "",
      shareLink.page.workspaceId,
      shareLink.page.workspace.publicWikiEnabled ? "wiki" : "text"
    )
  );

  return (
    <ReadOnlyDocument
      workspaceName={shareLink.page.workspace.name}
      title={shareLink.page.title}
      html={html}
      badge="Shared page"
    />
  );
}
