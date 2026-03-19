import { describe, it, expect } from "bun:test";
import { getRelativeTime } from "@/lib/utils/relativeTime";

describe("getRelativeTime", () => {
  it("방금 전 (60초 이내)을 반환한다", () => {
    const now = new Date().toISOString();
    expect(getRelativeTime(now)).toBe("방금 전");
  });

  it("30초 전을 '방금 전'으로 반환한다", () => {
    const date = new Date(Date.now() - 30 * 1000).toISOString();
    expect(getRelativeTime(date)).toBe("방금 전");
  });

  it("분 단위를 반환한다", () => {
    const date = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(getRelativeTime(date)).toBe("5분 전");
  });

  it("59분 전을 분 단위로 반환한다", () => {
    const date = new Date(Date.now() - 59 * 60 * 1000).toISOString();
    expect(getRelativeTime(date)).toBe("59분 전");
  });

  it("시간 단위를 반환한다", () => {
    const date = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    expect(getRelativeTime(date)).toBe("3시간 전");
  });

  it("23시간 전을 시간 단위로 반환한다", () => {
    const date = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
    expect(getRelativeTime(date)).toBe("23시간 전");
  });

  it("일 단위를 반환한다", () => {
    const date = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(getRelativeTime(date)).toBe("7일 전");
  });

  it("29일 전을 일 단위로 반환한다", () => {
    const date = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
    expect(getRelativeTime(date)).toBe("29일 전");
  });

  it("개월 단위를 반환한다", () => {
    const date = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    expect(getRelativeTime(date)).toBe("3개월 전");
  });

  it("11개월 전을 개월 단위로 반환한다", () => {
    const date = new Date(Date.now() - 330 * 24 * 60 * 60 * 1000).toISOString();
    expect(getRelativeTime(date)).toBe("11개월 전");
  });

  it("년 단위를 반환한다", () => {
    const date = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
    expect(getRelativeTime(date)).toBe("1년 전");
  });

  it("2년 이상도 올바르게 반환한다", () => {
    const date = new Date(Date.now() - 800 * 24 * 60 * 60 * 1000).toISOString();
    expect(getRelativeTime(date)).toBe("2년 전");
  });
});
