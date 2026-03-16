import { describe, it, expect, afterEach } from "bun:test";
import { getAllowedOrigins, isApiRoute } from "@/lib/middlewareUtils";

describe("middlewareUtils", () => {
  const originalNextAuthUrl = process.env.NEXTAUTH_URL;
  const originalCorsOrigins = process.env.CORS_ALLOWED_ORIGINS;

  afterEach(() => {
    if (originalNextAuthUrl !== undefined) {
      process.env.NEXTAUTH_URL = originalNextAuthUrl;
    } else {
      delete process.env.NEXTAUTH_URL;
    }
    if (originalCorsOrigins !== undefined) {
      process.env.CORS_ALLOWED_ORIGINS = originalCorsOrigins;
    } else {
      delete process.env.CORS_ALLOWED_ORIGINS;
    }
  });

  describe("getAllowedOrigins", () => {
    it("NEXTAUTH_URL 미설정 시 localhost:3000 반환", () => {
      delete process.env.NEXTAUTH_URL;
      delete process.env.CORS_ALLOWED_ORIGINS;
      const origins = getAllowedOrigins();
      expect(origins).toEqual(["http://localhost:3000"]);
    });

    it("NEXTAUTH_URL에서 origin 추출", () => {
      process.env.NEXTAUTH_URL = "https://wiki.example.com/some/path";
      delete process.env.CORS_ALLOWED_ORIGINS;
      const origins = getAllowedOrigins();
      expect(origins).toEqual(["https://wiki.example.com"]);
    });

    it("CORS_ALLOWED_ORIGINS 쉼표 구분 파싱", () => {
      process.env.NEXTAUTH_URL = "http://localhost:3000";
      process.env.CORS_ALLOWED_ORIGINS =
        "https://a.com, https://b.com , https://c.com";
      const origins = getAllowedOrigins();
      expect(origins).toEqual([
        "http://localhost:3000",
        "https://a.com",
        "https://b.com",
        "https://c.com",
      ]);
    });

    it("CORS_ALLOWED_ORIGINS 빈 항목 무시", () => {
      process.env.NEXTAUTH_URL = "http://localhost:3000";
      process.env.CORS_ALLOWED_ORIGINS = "https://a.com,,, ,https://b.com";
      const origins = getAllowedOrigins();
      expect(origins).toEqual([
        "http://localhost:3000",
        "https://a.com",
        "https://b.com",
      ]);
    });

    it("CORS_ALLOWED_ORIGINS 빈 문자열이면 기본 origin만 반환", () => {
      process.env.NEXTAUTH_URL = "http://localhost:3000";
      process.env.CORS_ALLOWED_ORIGINS = "";
      const origins = getAllowedOrigins();
      expect(origins).toEqual(["http://localhost:3000"]);
    });
  });

  describe("isApiRoute", () => {
    it("/api/로 시작하는 경로 → true", () => {
      expect(isApiRoute("/api/pages")).toBe(true);
      expect(isApiRoute("/api/workspaces/123")).toBe(true);
      expect(isApiRoute("/api/")).toBe(true);
    });

    it("/api/로 시작하지 않는 경로 → false", () => {
      expect(isApiRoute("/workspace/123")).toBe(false);
      expect(isApiRoute("/organizations")).toBe(false);
      expect(isApiRoute("/login")).toBe(false);
      expect(isApiRoute("")).toBe(false);
    });

    it("/api 뒤에 슬래시 없으면 false", () => {
      expect(isApiRoute("/api")).toBe(false);
      expect(isApiRoute("/apikeys")).toBe(false);
    });
  });
});
