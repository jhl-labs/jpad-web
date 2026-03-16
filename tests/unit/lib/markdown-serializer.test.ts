import { describe, it, expect } from "bun:test";
import { blocksToMarkdown } from "@/lib/markdown/serializer";

// blocksToMarkdown의 기본 변환 로직을 테스트합니다.
// Block 타입은 BlockNote의 Block을 사용하지만, 테스트에서는 최소 필요 필드만 전달합니다.

function makeBlock(type: string, content: unknown[], props?: Record<string, unknown>, children?: unknown[]) {
  return { type, content, props: props ?? {}, children: children ?? [], id: "test" } as never;
}

function textInline(text: string, styles?: Record<string, boolean>) {
  return { type: "text", text, styles: styles ?? {} };
}

describe("markdown-serializer - blocksToMarkdown", () => {
  it("일반 텍스트 블록을 변환한다", () => {
    const blocks = [makeBlock("paragraph", [textInline("Hello world")])];
    const md = blocksToMarkdown(blocks);
    expect(md).toContain("Hello world");
  });

  it("헤딩 블록을 변환한다", () => {
    const blocks = [
      makeBlock("heading", [textInline("Title")], { level: 1 }),
      makeBlock("heading", [textInline("Subtitle")], { level: 2 }),
      makeBlock("heading", [textInline("H3")], { level: 3 }),
    ];
    const md = blocksToMarkdown(blocks);
    expect(md).toContain("# Title");
    expect(md).toContain("## Subtitle");
    expect(md).toContain("### H3");
  });

  it("bullet list 블록을 변환한다", () => {
    const blocks = [makeBlock("bulletListItem", [textInline("Item 1")])];
    const md = blocksToMarkdown(blocks);
    expect(md).toContain("- Item 1");
  });

  it("numbered list 블록을 변환한다", () => {
    const blocks = [makeBlock("numberedListItem", [textInline("First")])];
    const md = blocksToMarkdown(blocks);
    expect(md).toContain("1. First");
  });

  it("check list 블록을 변환한다", () => {
    const checked = makeBlock("checkListItem", [textInline("Done")], { checked: true });
    const unchecked = makeBlock("checkListItem", [textInline("Todo")], { checked: false });
    const md = blocksToMarkdown([checked, unchecked]);
    expect(md).toContain("- [x] Done");
    expect(md).toContain("- [ ] Todo");
  });

  it("code block을 변환한다", () => {
    const blocks = [makeBlock("codeBlock", [textInline("const x = 1;")], { language: "ts" })];
    const md = blocksToMarkdown(blocks);
    expect(md).toContain("```ts");
    expect(md).toContain("const x = 1;");
    expect(md).toContain("```");
  });

  it("image 블록을 변환한다", () => {
    const blocks = [makeBlock("image", [], { url: "https://example.com/img.png", caption: "photo" })];
    const md = blocksToMarkdown(blocks);
    expect(md).toContain("![photo](https://example.com/img.png)");
  });

  it("bold/italic/strikethrough 스타일을 변환한다", () => {
    const blocks = [
      makeBlock("paragraph", [
        textInline("bold", { bold: true }),
        textInline(" "),
        textInline("italic", { italic: true }),
        textInline(" "),
        textInline("strike", { strikethrough: true }),
      ]),
    ];
    const md = blocksToMarkdown(blocks);
    expect(md).toContain("**bold**");
    expect(md).toContain("*italic*");
    expect(md).toContain("~~strike~~");
  });

  it("빈 블록 배열은 빈 줄만 반환한다", () => {
    const md = blocksToMarkdown([]);
    expect(md.trim()).toBe("");
  });

  it("중첩 children을 들여쓰기하여 변환한다", () => {
    const child = makeBlock("paragraph", [textInline("nested")]);
    const parent = makeBlock("bulletListItem", [textInline("parent")], {}, [child]);
    const md = blocksToMarkdown([parent]);
    expect(md).toContain("- parent");
    expect(md).toContain("  nested");
  });
});
