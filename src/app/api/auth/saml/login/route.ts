import { NextRequest, NextResponse } from "next/server";
import { getSamlAuthorizeUrl, sanitizeAuthCallbackUrl } from "@/lib/auth/saml";
import { logError } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  const callbackUrl = sanitizeAuthCallbackUrl(
    request.nextUrl.searchParams.get("callbackUrl")
  );

  try {
    const authorizeUrl = await getSamlAuthorizeUrl(callbackUrl);
    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    logError("auth.saml.login_failed", error);
    loginUrl.searchParams.set("error", "SAMLProviderDisabled");
    return NextResponse.redirect(loginUrl);
  }
}
