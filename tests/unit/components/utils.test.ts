import { describe, it, expect } from "bun:test";

// TrashPanel.tsx의 relativeTime 함수 로직을 재현하여 테스트합니다.
// 컴포넌트 내부 함수이므로 직접 import이 어렵습니다.

function relativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return date.toLocaleDateString("ko");
}

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
