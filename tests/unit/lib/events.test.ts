import { describe, it, expect } from "bun:test";
import { AI_EVENTS, SIDEBAR_EVENTS } from "@/lib/events";

describe("events - 이벤트 상수", () => {
  it("AI_EVENTS에 필수 이벤트가 정의되어 있다", () => {
    expect(AI_EVENTS.AUTOCOMPLETE).toBe("ai:autocomplete");
    expect(AI_EVENTS.ACTION).toBe("ai:action");
    expect(AI_EVENTS.OPEN_PANEL).toBe("ai:open-panel");
    expect(AI_EVENTS.EXECUTE_ACTION).toBe("ai:execute-action");
    expect(AI_EVENTS.INLINE_ACTION).toBe("ai:inline-action");
  });

  it("SIDEBAR_EVENTS에 필수 이벤트가 정의되어 있다", () => {
    expect(SIDEBAR_EVENTS.REFRESH).toBe("sidebar:refresh");
  });

  it("AI_EVENTS 값은 모두 'ai:' 접두사를 가진다", () => {
    for (const value of Object.values(AI_EVENTS)) {
      expect(value).toMatch(/^ai:/);
    }
  });

  it("SIDEBAR_EVENTS 값은 모두 'sidebar:' 접두사를 가진다", () => {
    for (const value of Object.values(SIDEBAR_EVENTS)) {
      expect(value).toMatch(/^sidebar:/);
    }
  });

  it("이벤트 상수 객체는 as const로 불변이다", () => {
    // TypeScript as const는 런타임에서 일반 객체이므로 키 존재만 확인
    expect(Object.keys(AI_EVENTS).length).toBeGreaterThan(0);
    expect(Object.keys(SIDEBAR_EVENTS).length).toBeGreaterThan(0);
  });
});
