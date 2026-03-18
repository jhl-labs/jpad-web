/**
 * y-websocket compatible WebSocket server.
 */
import { createHmac } from "node:crypto";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import Redis from "ioredis";
import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { loadDocSnapshot, saveDocSnapshot } from "./yjsPersistence";

const PORT = parseInt(process.env.WS_PORT || "1234", 10);
const TOKEN_MAX_AGE_MS = 5 * 60 * 1000;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const SERVER_ID = Math.random().toString(36).slice(2);

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;
const REDIS_ORIGIN = Symbol("redis");
const SNAPSHOT_ORIGIN = Symbol("snapshot");

const pub = new Redis(REDIS_URL);
const sub = new Redis(REDIS_URL);

interface SharedDoc {
  docName: string;
  ydoc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Map<WebSocket, Set<number>>;
  updateHandler: (update: Uint8Array, origin: unknown) => void;
  persistTimer: ReturnType<typeof setTimeout> | null;
}

interface TokenPayload {
  userId: string;
  workspaceId: string;
  pageId: string;
  canEdit: boolean;
  timestamp: number;
}

interface TokenValidationResult {
  valid: boolean;
  canEdit: boolean;
}

const docs = new Map<string, SharedDoc>();
const docInitializations = new Map<string, Promise<SharedDoc>>();

function validateToken(token: string, docName: string): TokenValidationResult {
  const fail: TokenValidationResult = { valid: false, canEdit: false };
  try {
    const secret = process.env.WS_SECRET ?? process.env.NEXTAUTH_SECRET;
    if (!secret) {
      console.error("WS auth: WS_SECRET or NEXTAUTH_SECRET not set");
      return fail;
    }

    const parts = token.split(".");
    if (parts.length !== 2) {
      console.error("WS auth: invalid token format");
      return fail;
    }

    const [data, sig] = parts;
    const expectedSig = createHmac("sha256", secret)
      .update(data)
      .digest("base64url");

    if (sig.length !== expectedSig.length || !timingSafeEqual(sig, expectedSig)) {
      console.error("WS auth: invalid signature");
      return fail;
    }

    const payload: TokenPayload = JSON.parse(
      Buffer.from(data, "base64url").toString("utf-8")
    );

    const now = Date.now();
    if (Math.abs(now - payload.timestamp) > TOKEN_MAX_AGE_MS) {
      console.error("WS auth: token expired");
      return fail;
    }

    const [roomWorkspaceId, roomPageId] = docName.split(":");
    if (payload.workspaceId !== roomWorkspaceId) {
      console.error("WS auth: workspace mismatch");
      return fail;
    }
    if (payload.pageId !== roomPageId) {
      console.error("WS auth: page mismatch");
      return fail;
    }

    return { valid: true, canEdit: payload.canEdit !== false };
  } catch (err) {
    console.error("WS auth: token validation error:", err);
    return fail;
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function toUint8Array(data: RawData): Uint8Array {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (Array.isArray(data)) {
    return new Uint8Array(Buffer.concat(data));
  }
  return new Uint8Array(data);
}

async function persistSharedDoc(shared: SharedDoc) {
  const snapshot = Y.encodeStateAsUpdate(shared.ydoc);
  await saveDocSnapshot(shared.docName, snapshot);
}

function schedulePersist(shared: SharedDoc) {
  if (shared.persistTimer) {
    clearTimeout(shared.persistTimer);
  }

  shared.persistTimer = setTimeout(() => {
    shared.persistTimer = null;
    void persistSharedDoc(shared).catch((err) => {
      console.error("Yjs snapshot save error:", err);
    });
  }, 300);
}

function createSharedDoc(docName: string): Promise<SharedDoc> {
  return (async () => {
    const ydoc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(ydoc);

    const shared: SharedDoc = {
      docName,
      ydoc,
      awareness,
      conns: new Map(),
      updateHandler: () => undefined,
      persistTimer: null,
    };

    awareness.on(
      "update",
      (
        {
          added,
          updated,
          removed,
        }: {
          added: number[];
          updated: number[];
          removed: number[];
        },
        origin: WebSocket | null
      ) => {
        if (origin instanceof WebSocket) {
          const controlledIds = shared.conns.get(origin);
          if (controlledIds) {
            for (const clientId of [...added, ...updated]) {
              controlledIds.add(clientId);
            }
            for (const clientId of removed) {
              controlledIds.delete(clientId);
            }
          }
        }

        const changedClients = [...added, ...updated, ...removed];
        if (changedClients.length === 0) {
          return;
        }

        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_AWARENESS);
        encoding.writeVarUint8Array(
          encoder,
          awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients)
        );
        const msg = encoding.toUint8Array(encoder);

        shared.conns.forEach((_, conn) => {
          if (conn !== origin && conn.readyState === WebSocket.OPEN) {
            conn.send(msg);
          }
        });
      }
    );

    shared.updateHandler = (update: Uint8Array, origin: unknown) => {
      if (origin === SNAPSHOT_ORIGIN) {
        return;
      }

      schedulePersist(shared);

      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MSG_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      const msg = encoding.toUint8Array(encoder);

      shared.conns.forEach((_, conn) => {
        if (conn !== origin && conn.readyState === WebSocket.OPEN) {
          conn.send(msg);
        }
      });

      if (origin !== REDIS_ORIGIN) {
        void pub
          .publish(
            `yjs:${docName}`,
            JSON.stringify({
              serverId: SERVER_ID,
              update: Buffer.from(update).toString("base64"),
            })
          )
          .catch((err) => {
            console.error("Redis publish error:", err);
          });
      }
    };

    ydoc.on("update", shared.updateHandler);

    const snapshot = await loadDocSnapshot(docName);
    if (snapshot) {
      Y.applyUpdate(ydoc, snapshot, SNAPSHOT_ORIGIN);
    }

    docs.set(docName, shared);

    try {
      await sub.subscribe(`yjs:${docName}`);
    } catch (err) {
      console.error("Redis subscribe error:", err);
    }

    return shared;
  })();
}

async function getOrCreateDoc(docName: string): Promise<SharedDoc> {
  const existing = docs.get(docName);
  if (existing) {
    return existing;
  }

  const pending = docInitializations.get(docName);
  if (pending) {
    return pending;
  }

  const initialization = createSharedDoc(docName).finally(() => {
    docInitializations.delete(docName);
  });
  docInitializations.set(docName, initialization);
  return initialization;
}

sub.on("message", (channel: string, message: string) => {
  try {
    const payload = JSON.parse(message) as {
      serverId: string;
      update: string;
    };
    if (payload.serverId === SERVER_ID) {
      return;
    }

    const docName = channel.replace("yjs:", "");
    const shared = docs.get(docName);
    if (!shared) {
      return;
    }

    const update = Buffer.from(payload.update, "base64");
    Y.applyUpdate(shared.ydoc, new Uint8Array(update), REDIS_ORIGIN);
  } catch (err) {
    console.error("Redis message error:", err);
  }
});

function computeAllowedOrigins(): Set<string> {
  const origins = new Set<string>();
  const nextauthUrl = process.env.NEXTAUTH_URL;
  if (nextauthUrl) {
    try { origins.add(new URL(nextauthUrl).origin); } catch (_error) {}
  }
  const extra = process.env.CORS_ALLOWED_ORIGINS;
  if (extra) {
    extra.split(",").map((o) => o.trim()).filter(Boolean).forEach((o) => origins.add(o));
  }
  return origins;
}

// Cache allowed origins at module level (env vars don't change at runtime)
const cachedAllowedOrigins = computeAllowedOrigins();

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin) return true; // non-browser clients (curl, etc.)
  if (process.env.NODE_ENV !== "production") return true; // dev: allow all
  // NEXTAUTH_URL이 미설정이면 모든 origin 허용 (Docker 배포 시 자동 감지 모드)
  if (cachedAllowedOrigins.size === 0) return true;
  return cachedAllowedOrigins.has(origin);
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", async (ws: WebSocket, req) => {
  const origin = req.headers.origin;
  if (!isOriginAllowed(origin)) {
    console.error(`WS rejected: origin ${origin} not allowed`);
    ws.close(4003, "Forbidden origin");
    return;
  }

  const url = new URL(req.url || "/", `http://localhost:${PORT}`);
  const docName = url.pathname.slice(1) || "default";
  const token = url.searchParams.get("token");

  const tokenResult = token ? validateToken(token, docName) : null;
  if (!token || !tokenResult?.valid) {
    ws.close(4001, "Unauthorized");
    return;
  }

  const canEdit = tokenResult.canEdit;

  let shared: SharedDoc;
  try {
    shared = await getOrCreateDoc(docName);
  } catch (err) {
    console.error("WS document initialization error:", err);
    ws.close(1011, "Initialization failed");
    return;
  }

  shared.conns.set(ws, new Set());
  console.log(`[WS] client connected to "${docName}" (total: ${shared.conns.size})`);

  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_SYNC);
  syncProtocol.writeSyncStep1(encoder, shared.ydoc);
  ws.send(encoding.toUint8Array(encoder));

  const awarenessStates = shared.awareness.getStates();
  if (awarenessStates.size > 0) {
    const awarenessEncoder = encoding.createEncoder();
    encoding.writeVarUint(awarenessEncoder, MSG_AWARENESS);
    encoding.writeVarUint8Array(
      awarenessEncoder,
      awarenessProtocol.encodeAwarenessUpdate(
        shared.awareness,
        Array.from(awarenessStates.keys())
      )
    );
    ws.send(encoding.toUint8Array(awarenessEncoder));
  }

  ws.on("message", (data: RawData) => {
    try {
      const message = toUint8Array(data);
      const decoder = decoding.createDecoder(message);
      const msgType = decoding.readVarUint(decoder);

      switch (msgType) {
        case MSG_SYNC: {
          // viewer(canEdit=false)의 쓰기 차단: sync message type 2(update)를 무시
          // y-protocols: 0=SyncStep1, 1=SyncStep2, 2=Update
          if (!canEdit) {
            const peekDecoder = decoding.createDecoder(message);
            decoding.readVarUint(peekDecoder); // skip msgType
            const syncType = decoding.readVarUint(peekDecoder);
            if (syncType === 2) {
              // Update 메시지 무시 - viewer는 문서를 수정할 수 없음
              console.log(`[WS] blocked update from read-only client doc="${shared.docName}"`);
              break;
            }
          }

          const replyEncoder = encoding.createEncoder();
          encoding.writeVarUint(replyEncoder, MSG_SYNC);
          const syncMessageType = syncProtocol.readSyncMessage(decoder, replyEncoder, shared.ydoc, ws);
          if (process.env.NODE_ENV === "development") {
            console.log(`[WS] sync msg type=${syncMessageType} doc="${shared.docName}" conns=${shared.conns.size}`);
          }

          if (encoding.length(replyEncoder) > 1) {
            ws.send(encoding.toUint8Array(replyEncoder));
          }
          break;
        }
        case MSG_AWARENESS: {
          awarenessProtocol.applyAwarenessUpdate(
            shared.awareness,
            decoding.readVarUint8Array(decoder),
            ws
          );
          break;
        }
      }
    } catch (err) {
      console.error("WS message error:", err);
    }
  });

  ws.on("close", () => {
    const controlledIds = shared.conns.get(ws);
    shared.conns.delete(ws);
    console.log(`[WS] client disconnected from "${shared.docName}" (remaining: ${shared.conns.size})`);

    if (controlledIds && controlledIds.size > 0) {
      awarenessProtocol.removeAwarenessStates(
        shared.awareness,
        Array.from(controlledIds),
        null
      );
    }

    if (shared.conns.size === 0) {
      if (shared.persistTimer) {
        clearTimeout(shared.persistTimer);
        shared.persistTimer = null;
      }

      const snapshot = Y.encodeStateAsUpdate(shared.ydoc);

      // snapshot 저장을 먼저 완료한 후 정리
      void (async () => {
        try {
          await saveDocSnapshot(docName, snapshot);
        } catch (err) {
          console.error("Yjs snapshot flush error:", err);
        } finally {
          docs.delete(docName);
          shared.ydoc.off("update", shared.updateHandler);
          shared.awareness.destroy();
          shared.ydoc.destroy();

          void sub.unsubscribe(`yjs:${docName}`).catch((err) => {
            console.error("Redis unsubscribe error:", err);
          });
        }
      })();
    }
  });
});

console.log(`y-websocket server running on ws://localhost:${PORT}`);

// ── Graceful shutdown ──────────────────────────────────────────────
async function gracefulShutdown(signal: string) {
  console.log(`[WS] ${signal} received – shutting down gracefully…`);

  // 1. 새 연결 수락 중지
  wss.close();

  // 2. 모든 문서 persist + 연결 종료
  const shutdownPromises: Promise<void>[] = [];

  for (const [docName, shared] of docs) {
    if (shared.persistTimer) {
      clearTimeout(shared.persistTimer);
      shared.persistTimer = null;
    }

    const snapshot = Y.encodeStateAsUpdate(shared.ydoc);
    shutdownPromises.push(
      saveDocSnapshot(docName, snapshot).catch((err) => {
        console.error(`[WS] shutdown snapshot error (${docName}):`, err);
      })
    );

    for (const [conn] of shared.conns) {
      conn.close(1001, "Server shutting down");
    }
    shared.conns.clear();
    shared.ydoc.off("update", shared.updateHandler);
    shared.awareness.destroy();
    shared.ydoc.destroy();
  }
  docs.clear();

  await Promise.allSettled(shutdownPromises);

  // 3. Redis cleanup
  try {
    await sub.quit();
    await pub.quit();
  } catch (err) {
    console.error("[WS] Redis cleanup error:", err);
  }

  console.log("[WS] Graceful shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => void gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => void gracefulShutdown("SIGINT"));
