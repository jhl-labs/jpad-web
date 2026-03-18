import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { Node as PMNode } from "prosemirror-model";

const WIKI_LINK_RE = /\[\[([^\[\]]+)\]\]/g;
const pluginKey = new PluginKey("wikiLinks");

interface WikiLinkSpec {
  href: string;
}

function buildDecorations(doc: PMNode, workspaceId: string): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;

    WIKI_LINK_RE.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = WIKI_LINK_RE.exec(node.text)) !== null) {
      const from = pos + match.index;
      const to = from + match[0].length;
      const rawInner = match[1];
      const [identifierPart] = rawInner.split("|", 2);
      const slug = identifierPart.trim();
      const encodedSlug = slug
        .split("/")
        .map((s) => encodeURIComponent(s))
        .join("/");
      const href = `/wiki/${workspaceId}/${encodedSlug}`;

      decorations.push(
        Decoration.inline(from, to, { class: "wiki-link" }, { href } as WikiLinkSpec)
      );
    }
  });

  return DecorationSet.create(doc, decorations);
}

export function createWikiLinkPlugin(workspaceId: string) {
  return new Plugin({
    key: pluginKey,
    state: {
      init(_, { doc }) {
        return buildDecorations(doc, workspaceId);
      },
      apply(tr, old) {
        if (tr.docChanged) {
          return buildDecorations(tr.doc, workspaceId);
        }
        return old.map(tr.mapping, tr.doc);
      },
    },
    props: {
      decorations(state) {
        return pluginKey.getState(state) as DecorationSet | undefined;
      },
      handleClick(view, pos) {
        const decos = pluginKey.getState(view.state) as DecorationSet | undefined;
        if (!decos) return false;

        const found = decos.find(pos, pos);
        for (const deco of found) {
          const spec = (deco as unknown as { spec: WikiLinkSpec }).spec;
          if (spec?.href) {
            // Ctrl/Cmd + click to follow link
            window.location.href = spec.href;
            return true;
          }
        }
        return false;
      },
    },
  });
}
