import { logError, logInfo } from "../src/lib/logger";
import { prisma } from "../src/lib/prisma";
import { runTrackedSearchIndexWorker } from "../src/lib/semanticIndexWorker";

function readFlag(name: string): string | null {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function main() {
  const workspaceId = readFlag("--workspace-id") || undefined;
  const limitFlag = readFlag("--limit");
  const trigger = readFlag("--trigger") || process.env.SEARCH_INDEX_TRIGGER || "manual";
  const limit = limitFlag ? Math.min(100, Math.max(1, Number.parseInt(limitFlag, 10) || 1)) : 50;

  logInfo("semantic.index_jobs.started", {
    workspaceId: workspaceId || null,
    limit,
    trigger,
  });

  const result = await runTrackedSearchIndexWorker({ workspaceId, limit, trigger });

  logInfo("semantic.index_jobs.completed", {
    workspaceId: workspaceId || null,
    limit,
    trigger,
    searchIndexWorkerRunId: result.runId,
    processedCount: result.summary.processedJobCount,
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    logError("semantic.index_jobs.failed", error);
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
