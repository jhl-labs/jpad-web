import { describe, it, expect } from "bun:test";
import { getStatusBadgeStyle } from "@/lib/utils/statusStyles";

describe("getStatusBadgeStyle", () => {
  it("success 상태를 올바르게 반환한다", () => {
    const style = getStatusBadgeStyle("success");
    expect(style.label).toBe("완료");
    expect(style.background).toContain("34,197,94");
    expect(style.color).toContain("22,101,52");
  });

  it("running 상태를 올바르게 반환한다", () => {
    const style = getStatusBadgeStyle("running");
    expect(style.label).toBe("실행 중");
    expect(style.background).toContain("59,130,246");
    expect(style.color).toContain("29,78,216");
  });

  it("error 상태를 올바르게 반환한다", () => {
    const style = getStatusBadgeStyle("error");
    expect(style.label).toBe("오류");
    expect(style.background).toContain("239,68,68");
    expect(style.color).toContain("153,27,27");
  });

  it("알 수 없는 상태는 '대기 중'을 반환한다", () => {
    const style = getStatusBadgeStyle("unknown");
    expect(style.label).toBe("대기 중");
    expect(style.background).toBe("var(--sidebar-bg)");
    expect(style.color).toBe("var(--muted)");
  });

  it("빈 문자열도 default 케이스로 처리한다", () => {
    const style = getStatusBadgeStyle("");
    expect(style.label).toBe("대기 중");
  });

  it("모든 상태에 background, color, label 필드가 존재한다", () => {
    for (const status of ["success", "running", "error", "pending", ""]) {
      const style = getStatusBadgeStyle(status);
      expect(typeof style.background).toBe("string");
      expect(typeof style.color).toBe("string");
      expect(typeof style.label).toBe("string");
    }
  });
});
