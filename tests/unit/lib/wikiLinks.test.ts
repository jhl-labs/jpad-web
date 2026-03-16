import { describe, it, expect } from "bun:test";
import {
  escapeMarkdownLabel,
  buildWikiHref,
  rewriteWikiLinksForMarkdown,
} from "@/lib/wikiLinks";

describe("escapeMarkdownLabel", () => {
  it("대괄호를 이스케이프한다", () => {
    expect(escapeMarkdownLabel("[test]")).toBe("\\[test\\]");
  });

  it("대괄호가 없으면 그대로 반환한다", () => {
    expect(escapeMarkdownLabel("hello")).toBe("hello");
  });

  it("여러 대괄호를 모두 이스케이프한다", () => {
    expect(escapeMarkdownLabel("[[nested]]")).toBe("\\[\\[nested\\]\\]");
  });

  it("빈 문자열은 그대로 반환한다", () => {
    expect(escapeMarkdownLabel("")).toBe("");
  });
});

describe("buildWikiHref", () => {
  it("기본 경로를 생성한다", () => {
    expect(buildWikiHref("ws1", "hello-world")).toBe("/wiki/ws1/hello-world");
  });

  it("특수 문자를 인코딩한다", () => {
    expect(buildWikiHref("ws1", "한국어 페이지")).toBe(
      `/wiki/ws1/${encodeURIComponent("한국어 페이지")}`
    );
  });

  it("슬래시가 포함된 경로를 세그먼트별로 인코딩한다", () => {
    const result = buildWikiHref("ws1", "path/to/page");
    expect(result).toBe("/wiki/ws1/path/to/page");
  });
});

describe("rewriteWikiLinksForMarkdown", () => {
  it("[[link]]를 마크다운 링크로 변환한다", () => {
    const result = rewriteWikiLinksForMarkdown("보기: [[설계]]", "ws1");
    expect(result).toBe(
      `보기: [설계](${buildWikiHref("ws1", "설계")})`
    );
  });

  it("[[slug|label]]를 마크다운 링크로 변환한다", () => {
    const result = rewriteWikiLinksForMarkdown("보기: [[design|설계 문서]]", "ws1");
    expect(result).toBe(
      `보기: [설계 문서](${buildWikiHref("ws1", "design")})`
    );
  });

  it("linkMode=text이면 레이블만 반환한다", () => {
    const result = rewriteWikiLinksForMarkdown("보기: [[design|설계]]", "ws1", "text");
    expect(result).toBe("보기: 설계");
  });
});
