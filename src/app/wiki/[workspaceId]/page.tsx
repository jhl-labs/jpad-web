import { notFound, redirect } from "next/navigation";
import { ReadOnlyDocument } from "@/components/public/ReadOnlyDocument";
import { listAccessiblePages } from "@/lib/pageAccess";
import { getWorkspaceViewAccess } from "@/lib/publicAccess";
import { prisma } from "@/lib/prisma";
import { buildWikiHref } from "@/lib/wikiLinks";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default async function WikiIndexPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const { workspace, user, member } = await getWorkspaceViewAccess(workspaceId);

  if (!workspace) notFound();
  if (!member && !workspace.publicWikiEnabled) {
    if (!user) redirect("/login");
    notFound();
  }

  const pages = member && user
    ? (await listAccessiblePages(user.id, workspaceId)).pages.map((page) => ({
        title: page.title,
        slug: page.slug,
      }))
    : await prisma.page.findMany({
        where: { workspaceId, isDeleted: false, accessMode: "workspace" },
        orderBy: [{ parentId: "asc" }, { position: "asc" }],
        select: { title: true, slug: true },
      });

  if (pages.length === 0) {
    return (
      <ReadOnlyDocument
        workspaceName={workspace.name}
        title="Wiki"
        badge={workspace.publicWikiEnabled ? "Public wiki" : "Workspace wiki"}
        html="<p>No published pages yet.</p>"
      />
    );
  }

  const indexHtml = `<ul>${pages
    .map(
      (page) =>
        `<li><a href="${buildWikiHref(workspaceId, page.slug)}">${escapeHtml(page.title)}</a></li>`
    )
    .join("")}</ul>`;

  return (
    <ReadOnlyDocument
      workspaceName={workspace.name}
      title="Wiki"
      badge={workspace.publicWikiEnabled ? "Public wiki" : "Workspace wiki"}
      html={indexHtml}
      navItems={pages.map((page) => ({
        title: page.title,
        href: buildWikiHref(workspaceId, page.slug),
      }))}
    />
  );
}
