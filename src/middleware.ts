import { withAuth } from "next-auth/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { getAllowedOrigins, isApiRoute } from "@/lib/middlewareUtils";

function setCorsHeaders(
  response: NextResponse,
  origin: string | null
): NextResponse {
  const allowed = getAllowedOrigins();

  // origin이 허용 목록에 없으면 CORS 헤더를 설정하지 않음
  if (!origin || !allowed.includes(origin)) {
    return response;
  }

  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}

export default withAuth(
  function middleware(req: NextRequest) {
    const requestHeaders = new Headers(req.headers);
    const requestId =
      requestHeaders.get("x-request-id") ?? crypto.randomUUID();
    requestHeaders.set("x-request-id", requestId);

    // Handle CORS preflight for API routes
    if (req.method === "OPTIONS" && isApiRoute(req.nextUrl.pathname)) {
      const response = new NextResponse(null, { status: 204 });
      response.headers.set("x-request-id", requestId);
      return setCorsHeaders(response, req.headers.get("origin"));
    }

    const response = NextResponse.next({
      request: { headers: requestHeaders },
    });
    response.headers.set("x-request-id", requestId);

    // Add CORS headers to API responses
    if (isApiRoute(req.nextUrl.pathname)) {
      setCorsHeaders(response, req.headers.get("origin"));
    }

    return response;
  },
  {
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    "/organizations/:path*",
    "/workspace/:path*",
    "/api/organizations/:path*",
    "/api/workspaces/:path*",
    "/api/pages/:path*",
    "/api/backlinks/:path*",
    "/api/ai/:path*",
    "/api/ws-token/:path*",
    "/api/upload/:path*",
    "/api/trash/:path*",
    "/api/auth/:path*",
    "/api/admin/:path*",
    "/api/scim/:path*",
  ],
};
