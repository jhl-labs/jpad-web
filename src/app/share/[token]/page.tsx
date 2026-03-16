import { notFound } from "next/navigation";
import { ReadOnlyDocument } from "@/components/public/ReadOnlyDocument";
import { readPage } from "@/lib/git/repository";
import { markdownToHtml } from "@/lib/markdown/serializer";
import { getActiveShareLinkByToken } from "@/lib/publicAccess";
import { rewriteWikiLinksForMarkdown } from "@/lib/wikiLinks";

export default async function SharedPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
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
