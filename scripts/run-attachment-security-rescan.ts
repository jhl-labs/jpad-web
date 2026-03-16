import { logError, logInfo } from "../src/lib/logger";
import { prisma } from "../src/lib/prisma";
import { runAttachmentSecurityRescanBatch } from "../src/lib/attachmentSecurity";

function readFlag(name: string): string | null {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function main() {
  const limitFlag = readFlag("--limit");
  const workspaceId = readFlag("--workspace-id") || undefined;
  const trigger = readFlag("--trigger") || process.env.ATTACHMENT_SECURITY_TRIGGER || "manual";
  const limit = limitFlag ? Math.min(200, Math.max(1, Number.parseInt(limitFlag, 10) || 1)) : 50;

  logInfo("attachment.security.rescan.started", {
    trigger,
    workspaceId: workspaceId || null,
    limit,
  });

  const result = await runAttachmentSecurityRescanBatch({ limit, workspaceId });

  logInfo("attachment.security.rescan.completed", {
    trigger,
    workspaceId: workspaceId || null,
    limit,
    processedCount: result.processedCount,
    quarantinedCount: result.quarantinedCount,
    cleanCount: result.cleanCount,
    errorCount: result.errorCount,
  });

  console.log(JSON.stringify({ trigger, workspaceId: workspaceId || null, limit, ...result }, null, 2));
}

main()
  .catch((error) => {
    logError("attachment.security.rescan.failed", error);
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
