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

  it("시간 경과 후 리셋된다", () => {
    const key = `test-reset-${Date.now()}`;
    // windowMs를 1ms로 설정하여 즉시 만료
    for (let i = 0; i < 3; i++) {
      rateLimit(key, 3, 1);
    }
    // 약간의 지연 후 리셋 확인
    // bun test에서는 동기적으로 Date.now()가 다음 호출에서 이미 1ms 이상 경과 가능
    // 안전하게 작은 딜레이를 둠
    const start = Date.now();
    while (Date.now() - start < 5) {
      // busy wait 5ms
    }
    expect(rateLimit(key, 3, 1)).toBe(true);
  });

  it("DISABLE_RATE_LIMITS=1이면 항상 true를 반환한다", () => {
    process.env.DISABLE_RATE_LIMITS = "1";
    const key = `test-disabled-${Date.now()}`;
    for (let i = 0; i < 100; i++) {
      expect(rateLimit(key, 1, 60000)).toBe(true);
    }
  });

  it("pruneRateLimitMap이 10000개 이상일 때 정리한다", () => {
    // 10001개의 항목을 만들면 prune이 발생해야 함
    // 제한 내이므로 모두 true를 반환해야 한다
    for (let i = 0; i < 10010; i++) {
      const result = rateLimit(`prune-test-${i}-${Date.now()}`, 1, 60000);
      expect(result).toBe(true);
    }
    // prune 후에도 새 요청이 정상 동작
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
