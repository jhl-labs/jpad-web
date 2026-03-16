import { logError, logInfo } from "../src/lib/logger";
import { recordAuditLog } from "../src/lib/audit";
import { prisma } from "../src/lib/prisma";
import { reindexWorkspaceEmbeddings } from "../src/lib/semanticSearch";

function readFlag(name: string): string | null {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function resolveWorkspaceIds() {
  const workspaceIdFlag = readFlag("--workspace-id");
  const pageIdFlag = readFlag("--page-id");

  if (workspaceIdFlag) {
    return [workspaceIdFlag];
  }

  if (pageIdFlag) {
    const page = await prisma.page.findUnique({
      where: { id: pageIdFlag },
      select: { workspaceId: true },
    });
    if (!page) {
      throw new Error(`Page not found: ${pageIdFlag}`);
    }
    return [page.workspaceId];
  }

  const workspaces = await prisma.workspace.findMany({
    select: { id: true },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  });
  return workspaces.map((workspace) => workspace.id);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const trigger = readFlag("--trigger") || process.env.SEMANTIC_REINDEX_TRIGGER || "manual";
  const pageId = readFlag("--page-id");
  const limitFlag = readFlag("--limit");
  const limit = limitFlag ? Math.max(1, Number.parseInt(limitFlag, 10) || 1) : undefined;
  const workspaceIds = await resolveWorkspaceIds();

  const summaries = [];
  logInfo("semantic.reindex.started", {
    trigger,
    dryRun,
    workspaceCount: workspaceIds.length,
    pageId,
    limit,
  });

  for (const workspaceId of workspaceIds) {
    const summary = await reindexWorkspaceEmbeddings(workspaceId, {
      dryRun,
      pageId,
      limit,
    });
    summaries.push(summary);

    if (!dryRun) {
      await recordAuditLog({
        action: "search.reindex.executed",
        workspaceId,
        targetType: "semantic_index",
        metadata: JSON.parse(
          JSON.stringify({
            trigger,
            pageId: pageId || null,
            limit: limit || null,
            summary,
          })
        ),
      });
    }
  }

  const aggregate = summaries.reduce(
    (acc, entry) => ({
      workspaceCount: acc.workspaceCount + 1,
      totalPages: acc.totalPages + entry.totalPages,
      indexedPages: acc.indexedPages + entry.indexedPages,
      emptyPages: acc.emptyPages + entry.emptyPages,
      disabledPages: acc.disabledPages + entry.disabledPages,
      clearedPages: acc.clearedPages + entry.clearedPages,
      errorPages: acc.errorPages + entry.errorPages,
    }),
    {
      workspaceCount: 0,
      totalPages: 0,
      indexedPages: 0,
      emptyPages: 0,
      disabledPages: 0,
      clearedPages: 0,
      errorPages: 0,
    }
  );

  logInfo("semantic.reindex.completed", {
    trigger,
    dryRun,
    ...aggregate,
  });

  console.log(
    JSON.stringify(
      {
        trigger,
        dryRun,
        pageId: pageId || null,
        limit: limit || null,
        summary: aggregate,
        workspaces: summaries,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    logError("semantic.reindex.failed", error);
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
