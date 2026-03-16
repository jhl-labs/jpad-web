import { NextRequest, NextResponse } from "next/server";
import { reconcileSamlUser, sanitizeAuthCallbackUrl, validateSamlResponse } from "@/lib/auth/saml";
import { createSsoLoginToken } from "@/lib/auth/ssoLoginToken";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);

  try {
    const formData = await request.formData();
    const samlResponse = formData.get("SAMLResponse");
    const relayState = formData.get("RelayState");

    if (typeof samlResponse !== "string" || !samlResponse.trim()) {
      loginUrl.searchParams.set("error", "SAMLResponseInvalid");
      return NextResponse.redirect(loginUrl);
    }

    const validation = await validateSamlResponse(samlResponse);
    if (validation.loggedOut || !validation.profile) {
      loginUrl.searchParams.set("error", "SAMLResponseInvalid");
      return NextResponse.redirect(loginUrl);
    }

    const result = await reconcileSamlUser(validation.profile);
    if (!result.ok) {
      loginUrl.searchParams.set("error", result.error);
      return NextResponse.redirect(loginUrl);
    }

    const { rawToken } = await createSsoLoginToken({
      provider: "saml",
      userId: result.user.id,
    });

    const completionUrl = new URL("/saml/complete", request.url);
    completionUrl.searchParams.set("token", rawToken);
    completionUrl.searchParams.set(
      "callbackUrl",
      sanitizeAuthCallbackUrl(typeof relayState === "string" ? relayState : null)
    );
    return NextResponse.redirect(completionUrl);
  } catch {
    loginUrl.searchParams.set("error", "SAMLResponseInvalid");
    return NextResponse.redirect(loginUrl);
  }
}
