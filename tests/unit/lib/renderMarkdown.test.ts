import { describe, it, expect } from "bun:test";
import { renderMarkdown } from "@/lib/utils/renderMarkdown";

describe("renderMarkdown", () => {
  it("일반 텍스트를 <p> 태그로 변환한다", async () => {
    const result = await renderMarkdown("Hello world");
    expect(result).toContain("<p>");
    expect(result).toContain("Hello world");
    expect(result).toContain("</p>");
  });

  it("헤딩을 변환한다", async () => {
    const result = await renderMarkdown("# 제목");
    expect(result).toContain("<h1>");
    expect(result).toContain("제목");
  });

  it("굵은 텍스트를 변환한다", async () => {
    const result = await renderMarkdown("**bold**");
    expect(result).toContain("<strong>bold</strong>");
  });

  it("기울임 텍스트를 변환한다", async () => {
    const result = await renderMarkdown("*italic*");
    expect(result).toContain("<em>italic</em>");
  });

  it("링크를 변환한다", async () => {
    const result = await renderMarkdown("[링크](https://example.com)");
    expect(result).toContain("<a");
    expect(result).toContain("https://example.com");
    expect(result).toContain("링크");
  });

  it("코드 블록을 변환한다", async () => {
    const result = await renderMarkdown("```\nconst x = 1;\n```");
    expect(result).toContain("<code>");
    expect(result).toContain("const x = 1;");
  });

  it("인라인 코드를 변환한다", async () => {
    const result = await renderMarkdown("`code`");
    expect(result).toContain("<code>code</code>");
  });

  it("빈 문자열은 빈 결과를 반환한다", async () => {
    const result = await renderMarkdown("");
    expect(result.trim()).toBe("");
  });

  it("GFM 테이블을 변환한다", async () => {
    const md = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const result = await renderMarkdown(md);
    expect(result).toContain("<table>");
    expect(result).toContain("<td>1</td>");
  });

  it("XSS 스크립트를 제거한다 (sanitize)", async () => {
    const result = await renderMarkdown('<script>alert("xss")</script>');
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
  });

  it("GFM 취소선을 변환한다", async () => {
    const result = await renderMarkdown("~~deleted~~");
    expect(result).toContain("<del>deleted</del>");
  });
});
