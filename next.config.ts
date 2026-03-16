import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

const cspDirectives = [
  "default-src 'self'",
  // 'unsafe-eval' — BlockNote 에디터가 런타임 코드 평가를 사용하므로 필요합니다.
  // BlockNote가 이를 제거할 수 있게 되면 함께 제거하세요.
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  // connect-src의 ws:/wss: 와일드카드는 NEXT_PUBLIC_WS_URL origin만 허용하는 것이 이상적이지만,
  // CSP는 빌드 시점에 결정되고 Next.js config에서 런타임 환경변수 접근이 제한적이므로
  // 현재는 와일드카드를 유지합니다. middleware에서 동적 CSP를 생성하는 방안을 검토할 수 있습니다.
  isDev
    ? "connect-src 'self' ws: wss: http: https:"
    : "connect-src 'self' ws: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: cspDirectives.join("; ") },
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["isomorphic-git"],
  headers: async () => [
    { source: "/(.*)", headers: securityHeaders },
  ],
};

export default nextConfig;
