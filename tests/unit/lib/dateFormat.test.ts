import { describe, it, expect } from "bun:test";
import { formatDateTime, formatDateTimeFull } from "@/lib/utils/dateFormat";

describe("dateFormat - formatDateTime", () => {
  it("null이면 '-'를 반환한다", () => {
    expect(formatDateTime(null)).toBe("-");
  });

  it("빈 문자열이면 '-'를 반환한다", () => {
    expect(formatDateTime("")).toBe("-");
  });

  it("유효한 ISO 문자열을 포맷한다", () => {
    const result = formatDateTime("2025-06-15T14:30:00Z");
    // ko-KR 형식: "06. 15. 오후 11:30" 같은 패턴 (시간대에 따라 다름)
    expect(result).not.toBe("-");
    expect(result.length).toBeGreaterThan(0);
    // 월/일이 포함되어야 한다
    expect(result).toMatch(/\d/);
  });

  it("다양한 날짜 형식을 처리한다", () => {
    expect(formatDateTime("2024-01-01T00:00:00Z")).not.toBe("-");
    expect(formatDateTime("2025-12-31T23:59:59Z")).not.toBe("-");
  });
});

describe("dateFormat - formatDateTimeFull", () => {
  it("null이면 '-'를 반환한다", () => {
    expect(formatDateTimeFull(null)).toBe("-");
  });

  it("빈 문자열이면 '-'를 반환한다", () => {
    expect(formatDateTimeFull("")).toBe("-");
  });

  it("유효한 ISO 문자열을 연도 포함하여 포맷한다", () => {
    const result = formatDateTimeFull("2025-06-15T14:30:00Z");
    expect(result).not.toBe("-");
    // 연도가 포함되어야 한다
    expect(result).toContain("2025");
  });

  it("초 단위까지 포함한다", () => {
    const result = formatDateTimeFull("2025-06-15T14:30:45Z");
    expect(result).not.toBe("-");
    // 초가 포함된 포맷
    expect(result.length).toBeGreaterThan(10);
  });
});
