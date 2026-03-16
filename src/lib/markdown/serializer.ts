import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import rehypeSanitize from "rehype-sanitize";

import type { Block } from "@blocknote/core";
export { formatBacklink, parseBacklinks } from "@/lib/backlinks";

// BlockNote blocks -> Markdown string
export function blocksToMarkdown(blocks: Block[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "heading": {
        const level = block.props?.level || 1;
        const prefix = "#".repeat(level as number);
        lines.push(`${prefix} ${inlineToText(block.content)}`);
        break;
      }
      case "bulletListItem":
        lines.push(`- ${inlineToText(block.content)}`);
        break;
      case "numberedListItem":
        lines.push(`1. ${inlineToText(block.content)}`);
        break;
      case "checkListItem": {
        const checked = block.props?.checked ? "x" : " ";
        lines.push(`- [${checked}] ${inlineToText(block.content)}`);
        break;
      }
      case "codeBlock":
        lines.push("```" + (block.props?.language || ""));
        lines.push(inlineToText(block.content));
        lines.push("```");
        break;
      case "table":
        try {
          const tc = block.content as unknown as { rows: Array<{ cells: Array<Array<{ text: string }>> }> };
          if (tc && Array.isArray(tc.rows)) {
            for (let i = 0; i < tc.rows.length; i++) {
              const row = tc.rows[i];
              const cells = row.cells.map((cell) =>
                cell.map((c) => c.text).join("")
              );
              lines.push(`| ${cells.join(" | ")} |`);
              if (i === 0) {
                lines.push(`| ${cells.map(() => "---").join(" | ")} |`);
              }
            }
          }
        } catch { /* skip malformed tables */ }
        break;
      case "image":
        lines.push(`![${block.props?.caption || ""}](${block.props?.url || ""})`);
        break;
      default:
        lines.push(inlineToText(block.content));
        break;
    }

    // Process children (nested blocks)
    if (block.children && block.children.length > 0) {
      const childMd = blocksToMarkdown(block.children);
      lines.push(
        ...childMd
          .split("\n")
          .map((l: string) => (l ? "  " + l : l))
      );
    }

    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}

function inlineToText(content: unknown): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((inline: { type: string; text?: string; content?: unknown; styles?: Record<string, boolean>; href?: string }) => {
      if (inline.type === "text") {
        let text = inline.text || "";
        if (inline.styles?.bold) text = `**${text}**`;
        if (inline.styles?.italic) text = `*${text}*`;
        if (inline.styles?.strikethrough) text = `~~${text}~~`;
        if (inline.styles?.code) text = `\`${text}\``;
        return text;
      }
      if (inline.type === "link") {
        return `[${inlineToText(inline.content)}](${inline.href})`;
      }
      return inline.text || "";
    })
    .join("");
}

// Markdown -> HTML (for wiki export)
export async function markdownToHtml(markdown: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSanitize)
    .use(rehypeStringify)
    .process(markdown);

  return String(result);
}
