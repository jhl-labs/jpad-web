/**
 * Google Calendar API integration using raw fetch (no googleapis dependency).
 *
 * Credentials (clientId / clientSecret) are stored per-workspace in
 * WorkspaceSettings and passed explicitly to each function.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GoogleOAuthCredentials {
  clientId: string;
  clientSecret: string;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface GoogleEvent {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  status?: string;
  updated?: string;
  recurrence?: string[];
}

export interface GoogleEventInput {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime?: string; date?: string; timeZone?: string };
  end: { dateTime?: string; date?: string; timeZone?: string };
  recurrence?: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRedirectUri(): string {
  const base = process.env.NEXTAUTH_URL || "http://localhost:3000";
  return `${base}/api/google-calendar/callback`;
}

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const CALENDAR_BASE = "https://www.googleapis.com/calendar/v3";

// ---------------------------------------------------------------------------
// OAuth2 helpers
// ---------------------------------------------------------------------------

/**
 * Build the Google OAuth2 authorisation URL.
 * `state` should include enough info to route the user back to the right
 * workspace after the callback (e.g. JSON-encoded {workspaceId, userId}).
 */
export function getGoogleAuthUrl(
  credentials: GoogleOAuthCredentials,
  state: string
): string {
  const params = new URLSearchParams({
    client_id: credentials.clientId,
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCodeForTokens(
  credentials: GoogleOAuthCredentials,
  code: string
): Promise<GoogleTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
    expiresAt: new Date(Date.now() + (data.expires_in as number) * 1000),
  };
}

/**
 * Refresh an expired access token using the stored refresh token.
 */
export async function refreshAccessToken(
  credentials: GoogleOAuthCredentials,
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token refresh failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token as string,
    expiresAt: new Date(Date.now() + (data.expires_in as number) * 1000),
  };
}

// ---------------------------------------------------------------------------
// Calendar event CRUD
// ---------------------------------------------------------------------------

async function calendarFetch(
  accessToken: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const res = await fetch(`${CALENDAR_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });
  return res;
}

/**
 * List events in a calendar within a time range.
 */
export async function listGoogleEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<GoogleEvent[]> {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "2500",
  });

  const res = await calendarFetch(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google list events failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  return (data.items ?? []) as GoogleEvent[];
}

/**
 * Create a new event.
 */
export async function createGoogleEvent(
  accessToken: string,
  calendarId: string,
  event: GoogleEventInput
): Promise<GoogleEvent> {
  const res = await calendarFetch(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    { method: "POST", body: JSON.stringify(event) }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google create event failed: ${res.status} ${text}`);
  }

  return (await res.json()) as GoogleEvent;
}

/**
 * Update an existing event.
 */
export async function updateGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: GoogleEventInput
): Promise<GoogleEvent> {
  const res = await calendarFetch(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PUT", body: JSON.stringify(event) }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google update event failed: ${res.status} ${text}`);
  }

  return (await res.json()) as GoogleEvent;
}

/**
 * Delete an event.
 */
export async function deleteGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const res = await calendarFetch(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" }
  );

  // 404 / 410 are acceptable – event already gone
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const text = await res.text();
    throw new Error(`Google delete event failed: ${res.status} ${text}`);
  }
}
