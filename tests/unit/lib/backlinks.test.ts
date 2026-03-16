import { describe, it, expect } from "bun:test";
import { parseBacklinks, formatBacklink } from "@/lib/backlinks";

describe("parseBacklinks", () => {
  it("[[페이지 이름]] 형식을 파싱한다", () => {
    const result = parseBacklinks("참고: [[설계 문서]]에서 확인");
    expect(result).toEqual([{ identifier: "설계 문서", label: null }]);
  });

  it("[[slug|label]] 형식을 파싱한다", () => {
    const result = parseBacklinks("[[design-doc|설계 문서]] 참고");
    expect(result).toEqual([{ identifier: "design-doc", label: "설계 문서" }]);
  });

  it("여러 백링크를 파싱한다", () => {
    const result = parseBacklinks("[[A]]와 [[B|비]] 참고");
    expect(result).toHaveLength(2);
    expect(result[0].identifier).toBe("A");
    expect(result[1].identifier).toBe("B");
    expect(result[1].label).toBe("비");
  });

  it("중복 식별자는 제거한다", () => {
    const result = parseBacklinks("[[A]] 그리고 [[A]] 반복");
    expect(result).toHaveLength(1);
    expect(result[0].identifier).toBe("A");
  });

  it("빈 입력은 빈 배열을 반환한다", () => {
    expect(parseBacklinks("")).toEqual([]);
  });

  it("백링크가 없는 텍스트는 빈 배열을 반환한다", () => {
    expect(parseBacklinks("일반 텍스트입니다")).toEqual([]);
  });

  it("공백만 있는 [[  ]]는 무시한다", () => {
    expect(parseBacklinks("[[  ]]")).toEqual([]);
  });

  it("식별자 앞뒤 공백을 트림한다", () => {
    const result = parseBacklinks("[[  some page  ]]");
    expect(result[0].identifier).toBe("some page");
  });
});

describe("formatBacklink", () => {
  it("레이블 없이 포맷한다", () => {
    expect(formatBacklink("설계 문서")).toBe("[[설계 문서]]");
  });

  it("레이블과 함께 포맷한다", () => {
    expect(formatBacklink("design-doc", "설계 문서")).toBe("[[design-doc|설계 문서]]");
  });

  it("레이블이 식별자와 동일하면 레이블을 생략한다", () => {
    expect(formatBacklink("A", "A")).toBe("[[A]]");
  });
});
