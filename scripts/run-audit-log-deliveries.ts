import { logError, logInfo } from "../src/lib/logger";
import { prisma } from "../src/lib/prisma";
import { processAuditWebhookDeliveries } from "../src/lib/auditWebhook";

function readFlag(name: string): string | null {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function main() {
  const limitFlag = readFlag("--limit");
  const trigger = readFlag("--trigger") || process.env.AUDIT_LOG_DELIVERY_TRIGGER || "manual";
  const limit = limitFlag ? Math.min(200, Math.max(1, Number.parseInt(limitFlag, 10) || 1)) : undefined;

  logInfo("audit.webhook.run.started", {
    trigger,
    limit: limit ?? null,
  });

  const result = await processAuditWebhookDeliveries({ trigger, limit });

  logInfo("audit.webhook.run.completed", { ...result });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    logError("audit.webhook.run.failed", error);
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
