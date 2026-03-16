import { describe, it, expect } from "bun:test";
import { relativeTime } from "@/lib/utils/dateFormat";

// relativeTime은 src/lib/utils/dateFormat.ts에서 export된 함수를 직접 import하여 테스트합니다.

describe("relativeTime", () => {
  it("1분 미만이면 '방금 전'을 반환한다", () => {
    const now = new Date();
    expect(relativeTime(now)).toBe("방금 전");
    expect(relativeTime(new Date(Date.now() - 30000))).toBe("방금 전");
  });

  it("1분~59분이면 'N분 전'을 반환한다", () => {
    expect(relativeTime(new Date(Date.now() - 5 * 60000))).toBe("5분 전");
    expect(relativeTime(new Date(Date.now() - 30 * 60000))).toBe("30분 전");
    expect(relativeTime(new Date(Date.now() - 59 * 60000))).toBe("59분 전");
  });

  it("1시간~23시간이면 'N시간 전'을 반환한다", () => {
    expect(relativeTime(new Date(Date.now() - 60 * 60000))).toBe("1시간 전");
    expect(relativeTime(new Date(Date.now() - 12 * 60 * 60000))).toBe("12시간 전");
    expect(relativeTime(new Date(Date.now() - 23 * 60 * 60000))).toBe("23시간 전");
  });

  it("1일~29일이면 'N일 전'을 반환한다", () => {
    expect(relativeTime(new Date(Date.now() - 24 * 60 * 60000))).toBe("1일 전");
    expect(relativeTime(new Date(Date.now() - 7 * 24 * 60 * 60000))).toBe("7일 전");
    expect(relativeTime(new Date(Date.now() - 29 * 24 * 60 * 60000))).toBe("29일 전");
  });

  it("30일 이상이면 날짜를 반환한다", () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60000);
    const result = relativeTime(oldDate);
    // toLocaleDateString("ko") 형식 확인 — "2025. 1. 15." 같은 형식
    expect(result).not.toContain("전");
    expect(result.length).toBeGreaterThan(0);
  });
});
