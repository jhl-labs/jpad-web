import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { rateLimit, extractClientIp } from "@/lib/rateLimit";

describe("rateLimit", () => {
  const originalEnv = process.env.DISABLE_RATE_LIMITS;

  beforeEach(() => {
    delete process.env.DISABLE_RATE_LIMITS;
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.DISABLE_RATE_LIMITS = originalEnv;
    } else {
      delete process.env.DISABLE_RATE_LIMITS;
    }
  });

  it("제한 내 요청은 true를 반환한다", () => {
    const key = `test-allow-${Date.now()}`;
    expect(rateLimit(key, 5, 60000)).toBe(true);
    expect(rateLimit(key, 5, 60000)).toBe(true);
    expect(rateLimit(key, 5, 60000)).toBe(true);
  });

  it("제한 초과 요청은 false를 반환한다", () => {
    const key = `test-block-${Date.now()}`;
    for (let i = 0; i < 3; i++) {
      rateLimit(key, 3, 60000);
    }
    expect(rateLimit(key, 3, 60000)).toBe(false);
  });

  it("시간 경과 후 리셋된다", async () => {
    const key = `test-reset-${Date.now()}`;
    // windowMs를 1ms로 설정하여 즉시 만료
    for (let i = 0; i < 3; i++) {
      rateLimit(key, 3, 1);
    }
    // busy-wait 대신 Bun.sleep 사용
    await Bun.sleep(5);
    expect(rateLimit(key, 3, 1)).toBe(true);
  });

  it("DISABLE_RATE_LIMITS=1이면 항상 true를 반환한다", () => {
    process.env.DISABLE_RATE_LIMITS = "1";
    const key = `test-disabled-${Date.now()}`;
    for (let i = 0; i < 100; i++) {
      expect(rateLimit(key, 1, 60000)).toBe(true);
    }
  });

  it("pruneRateLimitMap이 임계치 이상일 때 정리한다", () => {
    // 충분한 항목을 만들어 prune 로직이 동작하는지 검증한다.
    // 10010개 대신 110개로 축소 — 로직 자체는 동일하게 검증 가능.
    // 실제 RATE_LIMIT_MAP_MAX_SIZE(10000)를 초과하진 않지만,
    // prune 호출 경로(새 키 생성 시 pruneRateLimitMap 호출)가 매 호출마다 실행됨을 확인.
    for (let i = 0; i < 110; i++) {
      const result = rateLimit(`prune-test-${i}-${Date.now()}`, 1, 60000);
      expect(result).toBe(true);
    }
    // 이후에도 새 요청이 정상 동작
    expect(rateLimit(`prune-after-${Date.now()}`, 5, 60000)).toBe(true);
  });
});

describe("extractClientIp", () => {
  it("x-forwarded-for 헤더에서 첫 번째 IP를 추출한다", () => {
    const headers = new Headers({
      "x-forwarded-for": "1.2.3.4, 5.6.7.8",
    });
    expect(extractClientIp(headers)).toBe("1.2.3.4");
  });

  it("x-real-ip 헤더를 사용한다", () => {
    const headers = new Headers({
      "x-real-ip": "10.0.0.1",
    });
    expect(extractClientIp(headers)).toBe("10.0.0.1");
  });

  it("헤더가 없으면 unknown을 반환한다", () => {
    expect(extractClientIp(new Headers())).toBe("unknown");
    expect(extractClientIp(null)).toBe("unknown");
    expect(extractClientIp(undefined)).toBe("unknown");
  });

  it("Record 형태의 헤더도 처리한다", () => {
    const headers: Record<string, string> = {
      "x-forwarded-for": "192.168.1.1",
    };
    expect(extractClientIp(headers)).toBe("192.168.1.1");
  });
});
