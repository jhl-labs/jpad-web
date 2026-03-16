/**
 * 미들웨어에서 사용하는 순수 유틸 함수들.
 * 테스트 가능하도록 별도 파일로 분리.
 */

export function getAllowedOrigins(): string[] {
  const url = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const origins = [new URL(url).origin];
  const extra = process.env.CORS_ALLOWED_ORIGINS;
  if (extra) {
    origins.push(
      ...extra
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean)
    );
  }
  return origins;
}

export function isApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/");
}
