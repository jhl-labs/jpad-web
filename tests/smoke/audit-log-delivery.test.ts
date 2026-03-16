import { createHmac, randomUUID } from "crypto";
import { createServer } from "http";
import { recordAuditLog } from "../../src/lib/audit";
import { processAuditWebhookDeliveries } from "../../src/lib/auditWebhook";
import { prisma } from "../../src/lib/prisma";

async function main() {
  const secret = "audit-webhook-smoke-secret";
  const action = `smoke.audit.webhook.${randomUUID()}`;
  const received: Array<{ headers: Record<string, string | string[] | undefined>; body: string }> = [];

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];

    req.on("data", (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      received.push({
        headers: req.headers,
        body,
      });
      res.writeHead(204);
      res.end();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to bind smoke server");
  }

  const previousEnv = {
    url: process.env.AUDIT_LOG_WEBHOOK_URL,
    secret: process.env.AUDIT_LOG_WEBHOOK_SECRET,
    label: process.env.AUDIT_LOG_WEBHOOK_LABEL,
    disabled: process.env.DISABLE_AUDIT_LOG_WEBHOOK,
  };

  process.env.AUDIT_LOG_WEBHOOK_URL = `http://127.0.0.1:${address.port}/siem`;
  process.env.AUDIT_LOG_WEBHOOK_SECRET = secret;
  process.env.AUDIT_LOG_WEBHOOK_LABEL = "smoke";
  delete process.env.DISABLE_AUDIT_LOG_WEBHOOK;

  try {
    await recordAuditLog({
      action,
      status: "success",
      actor: {
        id: "smoke-user",
        email: "smoke@example.com",
        name: "Smoke User",
        role: "admin",
      },
      metadata: {
        smoke: true,
      },
    });

    const result = await processAuditWebhookDeliveries({
      limit: 10,
      trigger: "manual",
    });

    if (result.deliveredCount !== 1 || result.errorCount !== 0) {
      throw new Error(`unexpected delivery result: ${JSON.stringify(result)}`);
    }

    if (received.length !== 1) {
      throw new Error(`expected exactly one webhook request, got ${received.length}`);
    }

    const request = received[0];
    const signature = request.headers["x-jpad-signature"];
    const expectedSignature = `sha256=${createHmac("sha256", secret)
      .update(request.body)
      .digest("hex")}`;

    if (signature !== expectedSignature) {
      throw new Error("webhook signature mismatch");
    }

    const payload = JSON.parse(request.body) as {
      source: string;
      version: number;
      event: {
        action: string;
        actorEmail: string | null;
      };
    };

    if (payload.source !== "jpad.audit_log" || payload.version !== 1) {
      throw new Error("unexpected payload envelope");
    }
    if (payload.event.action !== action || payload.event.actorEmail !== "smoke@example.com") {
      throw new Error("unexpected payload event body");
    }

    const delivery = await prisma.auditLogWebhookDelivery.findFirst({
      where: {
        destinationLabel: "smoke",
        auditLog: {
          action,
        },
      },
      include: {
        auditLog: {
          select: {
            action: true,
          },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    if (!delivery || delivery.status !== "delivered" || delivery.auditLog.action !== action) {
      throw new Error("delivery row was not marked as delivered");
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          deliveryId: delivery.id,
          action,
        },
        null,
        2
      )
    );
  } finally {
    process.env.AUDIT_LOG_WEBHOOK_URL = previousEnv.url;
    process.env.AUDIT_LOG_WEBHOOK_SECRET = previousEnv.secret;
    process.env.AUDIT_LOG_WEBHOOK_LABEL = previousEnv.label;
    if (previousEnv.disabled === undefined) {
      delete process.env.DISABLE_AUDIT_LOG_WEBHOOK;
    } else {
      process.env.DISABLE_AUDIT_LOG_WEBHOOK = previousEnv.disabled;
    }

    await prisma.auditLog.deleteMany({
      where: {
        action,
      },
    });

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
