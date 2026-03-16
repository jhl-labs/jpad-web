/**
 * Next.js instrumentation — runs once when the server starts.
 * Validates that critical environment variables are present so the app
 * fails fast instead of crashing later at runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;

  const required: [string, string][] = [
    ["DATABASE_URL", "PostgreSQL 연결 문자열이 필요합니다"],
    ["NEXTAUTH_SECRET", "NextAuth 서명 시크릿이 필요합니다"],
    ["NEXTAUTH_URL", "NextAuth 콜백 URL이 필요합니다"],
    ["APP_ENCRYPTION_KEY", "비밀값 암호화 키가 필요합니다"],
  ];

  const missing = required.filter(
    ([key]) => !process.env[key] || process.env[key]!.trim() === ""
  );

  if (missing.length > 0) {
    const lines = missing.map(([key, reason]) => `  - ${key}: ${reason}`);
    const message = [
      "",
      "=== JPAD 시작 실패: 필수 환경 변수 누락 ===",
      ...lines,
      "",
      "1. 프로젝트 루트의 .env.example을 .env로 복사하세요:",
      "     cp .env.example .env",
      "2. .env 파일을 열어 위 변수들을 환경에 맞게 설정하세요.",
      "3. 자세한 설명은 docs/deployment.md를 참고하세요.",
      "",
    ].join("\n");

    console.error(message);
    throw new Error("Missing required environment variables");
  }

  // Warn for recommended but non-critical variables
  const recommended: [string, string][] = [
    ["REDIS_URL", "Rate limiting과 WebSocket pub/sub에 Redis가 필요합니다"],
    ["WS_SECRET", "WebSocket 토큰 서명에 사용됩니다 (미설정 시 NEXTAUTH_SECRET fallback)"],
  ];

  for (const [key, reason] of recommended) {
    if (!process.env[key]) {
      console.warn(`[JPAD] 경고: ${key} 미설정 — ${reason}`);
    }
  }
}
