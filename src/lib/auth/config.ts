function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
}

export interface OidcRuntimeConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  wellKnown: string;
  name: string;
  scope: string;
  allowEmailLinking: boolean;
  requireVerifiedEmail: boolean;
}

export interface SamlRuntimeConfig {
  entryPoint: string;
  issuer: string;
  callbackUrl: string;
  idpCert: string;
  name: string;
  idpIssuer?: string;
  allowEmailLinking: boolean;
  requireEmail: boolean;
  acceptedClockSkewMs: number;
  requestIdExpirationPeriodMs: number;
}

export function normalizeEmailAddress(email: string): string {
  return email.trim().toLowerCase();
}

function parseIntegerEnv(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;

  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function getAppBaseUrl(): string | null {
  const raw =
    process.env.NEXTAUTH_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    null;

  if (!raw) return null;
  return raw.replace(/\/+$/, "");
}

function normalizePemCertificate(rawValue: string): string {
  const trimmed = rawValue.trim();

  if (trimmed.includes("BEGIN CERTIFICATE")) {
    return trimmed;
  }

  const normalized = trimmed.replace(/\s+/g, "");
  const wrapped = normalized.match(/.{1,64}/g)?.join("\n") || normalized;
  return `-----BEGIN CERTIFICATE-----\n${wrapped}\n-----END CERTIFICATE-----`;
}

export function isCredentialsLoginEnabled(): boolean {
  return parseBooleanEnv(process.env.AUTH_ALLOW_CREDENTIALS_LOGIN, true);
}

export function isSelfSignupEnabled(): boolean {
  if (!isCredentialsLoginEnabled()) return false;
  return parseBooleanEnv(process.env.AUTH_ALLOW_SELF_SIGNUP, true);
}

export function getOidcConfig(): OidcRuntimeConfig | null {
  if (!parseBooleanEnv(process.env.OIDC_ENABLED, false)) {
    return null;
  }

  const issuer = process.env.OIDC_ISSUER?.trim();
  const clientId = process.env.OIDC_CLIENT_ID?.trim();
  const clientSecret = process.env.OIDC_CLIENT_SECRET?.trim();

  if (!issuer || !clientId || !clientSecret) {
    return null;
  }

  const normalizedIssuer = issuer.replace(/\/+$/, "");
  const wellKnown =
    process.env.OIDC_WELL_KNOWN_URL?.trim() ||
    `${normalizedIssuer}/.well-known/openid-configuration`;

  return {
    issuer: normalizedIssuer,
    clientId,
    clientSecret,
    wellKnown,
    name: process.env.OIDC_NAME?.trim() || "Single Sign-On",
    scope: process.env.OIDC_SCOPE?.trim() || "openid profile email",
    allowEmailLinking: parseBooleanEnv(process.env.OIDC_ALLOW_EMAIL_LINKING, false),
    requireVerifiedEmail: parseBooleanEnv(process.env.OIDC_REQUIRE_VERIFIED_EMAIL, true),
  };
}

export function getSamlConfig(): SamlRuntimeConfig | null {
  if (!parseBooleanEnv(process.env.SAML_ENABLED, false)) {
    return null;
  }

  const appBaseUrl = getAppBaseUrl();
  const entryPoint = process.env.SAML_ENTRY_POINT?.trim();
  const idpCert = process.env.SAML_IDP_CERT?.trim();

  if (!appBaseUrl || !entryPoint || !idpCert) {
    return null;
  }

  return {
    entryPoint,
    issuer:
      process.env.SAML_ISSUER?.trim() || `${appBaseUrl}/api/auth/saml/metadata`,
    callbackUrl:
      process.env.SAML_CALLBACK_URL?.trim() || `${appBaseUrl}/api/auth/saml/acs`,
    idpCert: normalizePemCertificate(idpCert),
    name: process.env.SAML_NAME?.trim() || "SAML SSO",
    idpIssuer: process.env.SAML_IDP_ISSUER?.trim() || undefined,
    allowEmailLinking: parseBooleanEnv(process.env.SAML_ALLOW_EMAIL_LINKING, false),
    requireEmail: parseBooleanEnv(process.env.SAML_REQUIRE_EMAIL, true),
    acceptedClockSkewMs: parseIntegerEnv(process.env.SAML_ACCEPTED_CLOCK_SKEW_MS, 5_000),
    requestIdExpirationPeriodMs: parseIntegerEnv(
      process.env.SAML_REQUEST_ID_EXPIRATION_PERIOD_MS,
      5 * 60 * 1000
    ),
  };
}
