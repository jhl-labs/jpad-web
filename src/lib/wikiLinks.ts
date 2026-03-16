export function buildWikiHref(workspaceId: string, slug: string): string {
  const encodedSlug = slug
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `/wiki/${workspaceId}/${encodedSlug}`;
}

export function rewriteWikiLinksForMarkdown(
  content: string,
  workspaceId: string,
  linkMode: "wiki" | "text" = "wiki"
): string {
  return content.replace(/\[\[([^\]]+)\]\]/g, (_match, rawInner: string) => {
    const [identifierPart, labelPart] = rawInner.split("|", 2);
    const identifier = identifierPart.trim();
    const label = (labelPart?.trim() || identifier).trim();

    if (!identifier) return label;
    if (linkMode === "text") return label;

    return `[${escapeMarkdownLabel(label)}](${buildWikiHref(workspaceId, identifier)})`;
  });
}

function escapeMarkdownLabel(value: string): string {
  return value.replace(/([\[\]])/g, "\\$1");
}
