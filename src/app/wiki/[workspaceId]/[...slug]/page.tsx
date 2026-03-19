import { notFound, redirect } from "next/navigation";
import { ReadOnlyDocument } from "@/components/public/ReadOnlyDocument";
import { readPage } from "@/lib/git/repository";
import { markdownToHtml } from "@/lib/markdown/serializer";
import { getWorkspaceViewAccess } from "@/lib/publicAccess";
import { getPageAccessContext, listAccessiblePages } from "@/lib/pageAccess";
import { prisma } from "@/lib/prisma";
import { buildWikiHref, rewriteWikiLinksForMarkdown } from "@/lib/wikiLinks";

export default async function WikiPage({
  params,
}: {
  params: Promise<{ workspaceId: string; slug: string[] }>;
}) {
  const { workspaceId, slug } = await params;
  const { workspace, user, member } = await getWorkspaceViewAccess(workspaceId);

  if (!workspace) notFound();
  if (!member && !workspace.publicWikiEnabled) {
    if (!user) redirect("/login");
    notFound();
  }

  const pageSlug = slug.map(s => decodeURIComponent(s)).join("/");

  const page = await prisma.page.findFirst({
    where: {
      workspaceId,
      slug: pageSlug,
      isDeleted: false,
    },
    select: {
      id: true,
      title: true,
      slug: true,
    },
  });

  if (!page) notFound();
  if (!member) {
    const publicPage = await prisma.page.findFirst({
      where: {
        workspaceId,
        slug: pageSlug,
        isDeleted: false,
        accessMode: "workspace",
      },
      select: { slug: true },
    });
    if (!publicPage) notFound();
  } else if (user) {
    const access = await getPageAccessContext(user.id, page.id);
    if (!access?.canView) notFound();
  }

  const content = await readPage(workspaceId, page.slug);
  const html = await markdownToHtml(
    rewriteWikiLinksForMarkdown(content || "", workspaceId)
  );

  const allPages = member && user
    ? (await listAccessiblePages(user.id, workspaceId)).pages.map((entry) => ({
        title: entry.title,
        slug: entry.slug,
      }))
    : await prisma.page.findMany({
        where: { workspaceId, isDeleted: false, accessMode: "workspace" },
        orderBy: [{ parentId: "asc" }, { position: "asc" }],
        select: { title: true, slug: true },
      });

  return (
    <ReadOnlyDocument
      workspaceName={workspace.name}
      title={page.title}
      html={html}
      badge={workspace.publicWikiEnabled ? "Public wiki" : "Workspace wiki"}
      navItems={allPages.map((entry) => ({
        title: entry.title,
        href: buildWikiHref(workspaceId, entry.slug),
        active: entry.slug === pageSlug,
      }))}
    />
  );
}
