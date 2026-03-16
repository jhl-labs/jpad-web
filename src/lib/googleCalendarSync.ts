/**
 * Google Calendar ↔ jpad bidirectional sync logic.
 */

import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/secrets";
import {
  refreshAccessToken,
  listGoogleEvents,
  createGoogleEvent,
  deleteGoogleEvent,
  updateGoogleEvent,
  type GoogleEvent,
  type GoogleOAuthCredentials,
} from "@/lib/googleCalendar";
import type { GoogleCalendarConnection, CalendarEvent } from "@prisma/client";

/**
 * Load Google OAuth credentials from workspace settings.
 * Returns null if not configured.
 */
export async function getWorkspaceGoogleCredentials(
  workspaceId: string
): Promise<GoogleOAuthCredentials | null> {
  const settings = await prisma.workspaceSettings.findUnique({
    where: { workspaceId },
  });
  if (!settings?.googleCalendarClientId || !settings?.googleCalendarClientSecret) {
    return null;
  }
  const clientSecret = decryptSecret(settings.googleCalendarClientSecret);
  if (!clientSecret) return null;
  return {
    clientId: settings.googleCalendarClientId,
    clientSecret,
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncResult {
  pulled: { created: number; updated: number; deleted: number };
  pushed: { created: number; updated: number };
}

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

/**
 * Returns a valid (non-expired) access token for the given connection.
 * Automatically refreshes if the current token has expired or will expire
 * within the next 60 seconds.
 */
export async function getValidAccessToken(
  connection: GoogleCalendarConnection,
  credentials: GoogleOAuthCredentials
): Promise<string> {
  const bufferMs = 60_000;
  const now = new Date();

  if (connection.tokenExpiry.getTime() - bufferMs > now.getTime()) {
    const token = decryptSecret(connection.accessToken);
    if (!token) throw new Error("Failed to decrypt access token");
    return token;
  }

  const refreshToken = decryptSecret(connection.refreshToken);
  if (!refreshToken) throw new Error("Failed to decrypt refresh token");

  const { accessToken: newAccess, expiresAt } =
    await refreshAccessToken(credentials, refreshToken);

  await prisma.googleCalendarConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: encryptSecret(newAccess),
      tokenExpiry: expiresAt,
    },
  });

  return newAccess;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toGoogleDateTime(
  date: Date,
  allDay: boolean
): { dateTime?: string; date?: string } {
  if (allDay) {
    return { date: date.toISOString().slice(0, 10) };
  }
  return { dateTime: date.toISOString() };
}

function fromGoogleDateTime(
  dt: { dateTime?: string; date?: string } | undefined
): { date: Date; allDay: boolean } | null {
  if (!dt) return null;
  if (dt.dateTime) return { date: new Date(dt.dateTime), allDay: false };
  if (dt.date) return { date: new Date(dt.date), allDay: true };
  return null;
}

// ---------------------------------------------------------------------------
// Pull: Google → jpad
// ---------------------------------------------------------------------------

export async function pullFromGoogle(
  workspaceId: string,
  userId: string
): Promise<{ created: number; updated: number; deleted: number }> {
  const credentials = await getWorkspaceGoogleCredentials(workspaceId);
  if (!credentials) throw new Error("Google Calendar credentials not configured in workspace settings");

  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  if (!connection || !connection.syncEnabled) {
    throw new Error("No active Google Calendar connection");
  }

  const accessToken = await getValidAccessToken(connection, credentials);

  // Sync window: 6 months back, 12 months forward
  const timeMin = new Date();
  timeMin.setMonth(timeMin.getMonth() - 6);
  const timeMax = new Date();
  timeMax.setMonth(timeMax.getMonth() + 12);

  const googleEvents = await listGoogleEvents(
    accessToken,
    connection.calendarId,
    timeMin.toISOString(),
    timeMax.toISOString()
  );

  // Build lookup of existing jpad events linked to Google
  const existingEvents = await prisma.calendarEvent.findMany({
    where: { workspaceId, googleEventId: { not: null } },
  });
  const existingByGoogleId = new Map<string, CalendarEvent>();
  for (const ev of existingEvents) {
    if (ev.googleEventId) existingByGoogleId.set(ev.googleEventId, ev);
  }

  let created = 0;
  let updated = 0;
  let deleted = 0;

  const seenGoogleIds = new Set<string>();

  for (const gEvent of googleEvents) {
    if (gEvent.status === "cancelled") continue;
    seenGoogleIds.add(gEvent.id);

    const startInfo = fromGoogleDateTime(gEvent.start);
    if (!startInfo) continue;
    const endInfo = fromGoogleDateTime(gEvent.end);

    const existing = existingByGoogleId.get(gEvent.id);

    if (existing) {
      // Check if Google version is newer
      const googleUpdated = gEvent.updated
        ? new Date(gEvent.updated)
        : new Date();
      if (googleUpdated > existing.updatedAt) {
        await prisma.calendarEvent.update({
          where: { id: existing.id },
          data: {
            title: gEvent.summary || "Untitled",
            description: gEvent.description || null,
            location: gEvent.location || null,
            startAt: startInfo.date,
            endAt: endInfo?.date || null,
            allDay: startInfo.allDay,
          },
        });
        updated++;
      }
    } else {
      await prisma.calendarEvent.create({
        data: {
          title: gEvent.summary || "Untitled",
          description: gEvent.description || null,
          location: gEvent.location || null,
          startAt: startInfo.date,
          endAt: endInfo?.date || null,
          allDay: startInfo.allDay,
          googleEventId: gEvent.id,
          workspaceId,
          createdById: userId,
        },
      });
      created++;
    }
  }

  // Delete jpad events whose Google counterpart no longer exists
  for (const [googleId, ev] of existingByGoogleId) {
    if (!seenGoogleIds.has(googleId)) {
      await prisma.calendarEvent.delete({ where: { id: ev.id } });
      deleted++;
    }
  }

  // Update lastSyncAt
  await prisma.googleCalendarConnection.update({
    where: { id: connection.id },
    data: { lastSyncAt: new Date() },
  });

  return { created, updated, deleted };
}

// ---------------------------------------------------------------------------
// Push: jpad → Google
// ---------------------------------------------------------------------------

export async function pushToGoogle(
  workspaceId: string,
  userId: string
): Promise<{ created: number; updated: number }> {
  const credentials = await getWorkspaceGoogleCredentials(workspaceId);
  if (!credentials) throw new Error("Google Calendar credentials not configured in workspace settings");

  const connection = await prisma.googleCalendarConnection.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
  });
  if (!connection || !connection.syncEnabled) {
    throw new Error("No active Google Calendar connection");
  }

  const accessToken = await getValidAccessToken(connection, credentials);

  // Events without a googleEventId need to be pushed
  const localOnly = await prisma.calendarEvent.findMany({
    where: { workspaceId, googleEventId: null },
  });

  let created = 0;
  let updated = 0;

  for (const ev of localOnly) {
    const gEvent = await createGoogleEvent(
      accessToken,
      connection.calendarId,
      {
        summary: ev.title,
        description: ev.description || undefined,
        location: ev.location || undefined,
        start: toGoogleDateTime(ev.startAt, ev.allDay),
        end: toGoogleDateTime(ev.endAt || ev.startAt, ev.allDay),
      }
    );

    await prisma.calendarEvent.update({
      where: { id: ev.id },
      data: { googleEventId: gEvent.id },
    });
    created++;
  }

  // Push updates for events that already have a googleEventId and were
  // modified after last sync
  if (connection.lastSyncAt) {
    const modifiedSinceSync = await prisma.calendarEvent.findMany({
      where: {
        workspaceId,
        googleEventId: { not: null },
        updatedAt: { gt: connection.lastSyncAt },
      },
    });

    for (const ev of modifiedSinceSync) {
      if (!ev.googleEventId) continue;
      await updateGoogleEvent(
        accessToken,
        connection.calendarId,
        ev.googleEventId,
        {
          summary: ev.title,
          description: ev.description || undefined,
          location: ev.location || undefined,
          start: toGoogleDateTime(ev.startAt, ev.allDay),
          end: toGoogleDateTime(ev.endAt || ev.startAt, ev.allDay),
        }
      );
      updated++;
    }
  }

  await prisma.googleCalendarConnection.update({
    where: { id: connection.id },
    data: { lastSyncAt: new Date() },
  });

  return { created, updated };
}

// ---------------------------------------------------------------------------
// Full bidirectional sync
// ---------------------------------------------------------------------------

export async function syncCalendar(
  workspaceId: string,
  userId: string
): Promise<SyncResult> {
  const pulled = await pullFromGoogle(workspaceId, userId);
  const pushed = await pushToGoogle(workspaceId, userId);
  return { pulled, pushed };
}
