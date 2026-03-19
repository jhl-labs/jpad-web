import { describe, it, expect } from "bun:test";
import { slugify } from "@/lib/utils";

describe("slugify", () => {
  it("영문 텍스트를 소문자로 변환한다", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("한글 텍스트를 유지한다", () => {
    expect(slugify("프로젝트 설계")).toBe("프로젝트-설계");
  });

  it("특수 문자를 제거한다", () => {
    expect(slugify("Hello! @World#")).toBe("hello-world");
  });

  it("연속 공백을 하나의 하이픈으로 변환한다", () => {
    expect(slugify("hello   world")).toBe("hello-world");
  });

  it("연속 하이픈을 하나로 줄인다", () => {
    expect(slugify("hello---world")).toBe("hello-world");
  });

  it("빈 문자열을 반환한다", () => {
    expect(slugify("")).toBe("");
  });

  it("숫자를 유지한다", () => {
    expect(slugify("version 2")).toBe("version-2");
  });

  it("한글 자음/모음만 있는 경우도 유지한다", () => {
    expect(slugify("ㄱㄴㄷ")).toBe("ㄱㄴㄷ");
  });

  it("영문+한글 혼합을 처리한다", () => {
    expect(slugify("Next.js 프로젝트")).toBe("nextjs-프로젝트");
  });
});
