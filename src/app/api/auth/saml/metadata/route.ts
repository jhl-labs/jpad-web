import { NextResponse } from "next/server";
import { generateSamlServiceProviderMetadata } from "@/lib/auth/saml";

export const runtime = "nodejs";

export async function GET() {
  try {
    const metadata = generateSamlServiceProviderMetadata();
    return new NextResponse(metadata, {
      headers: {
        "content-type": "application/samlmetadata+xml; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "SAML provider is not configured" },
      { status: 404 }
    );
  }
}
