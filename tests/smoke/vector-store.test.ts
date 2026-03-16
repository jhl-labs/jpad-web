import { deletePageEmbeddings, getVectorStoreRuntimeStatus, replacePageEmbeddings, searchSimilarEmbeddings } from "../../src/lib/vectorStore";
import { logError, logInfo } from "../../src/lib/logger";
import { prisma } from "../../src/lib/prisma";

function readFlag(name: string): string | null {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

async function main() {
  const expectedBackend = readFlag("--expect-backend");
  const keepData = process.argv.includes("--keep-data");
  const token = `vector-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  let userId: string | null = null;
  let workspaceId: string | null = null;
  let pageId: string | null = null;

  try {
    const user = await prisma.user.create({
      data: {
        email: `${token}@example.com`,
        name: token,
      },
      select: { id: true },
    });
    userId = user.id;

    const workspace = await prisma.workspace.create({
      data: {
        name: token,
        slug: token,
      },
      select: { id: true, slug: true },
    });
    workspaceId = workspace.id;

    await prisma.workspaceMember.create({
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        role: "owner",
      },
    });

    const page = await prisma.page.create({
      data: {
        workspaceId: workspace.id,
        title: "Vector Smoke Page",
        slug: `${token}-page`,
      },
      select: { id: true, title: true },
    });
    pageId = page.id;

    await replacePageEmbeddings({
      workspaceId: workspace.id,
      pageId: page.id,
      provider: "smoke",
      model: "smoke-v1",
      chunks: [
        {
          chunkIndex: 0,
          title: page.title,
          content: "vector smoke alpha",
          contentHash: `${token}-0`,
          embedding: [0.98, 0.01, 0.01, 0],
        },
        {
          chunkIndex: 1,
          title: page.title,
          content: "vector smoke beta",
          contentHash: `${token}-1`,
          embedding: [0.1, 0.9, 0, 0],
        },
      ],
    });

    const status = await getVectorStoreRuntimeStatus({
      workspaceId: workspace.id,
      forceCheck: true,
    });

    if (
      expectedBackend &&
      status.effectiveReadBackend !== expectedBackend &&
      !(expectedBackend === "json" && status.effectiveReadBackend === "json")
    ) {
      throw new Error(
        `Expected effective backend ${expectedBackend}, got ${status.effectiveReadBackend}`
      );
    }

    const workspaceVectorChunkCount = status.workspaceCounts?.vectorChunkCount;

    if (
      expectedBackend &&
      expectedBackend !== "json" &&
      workspaceVectorChunkCount !== null &&
      workspaceVectorChunkCount !== undefined &&
      workspaceVectorChunkCount <= 0
    ) {
      throw new Error(
        `Expected vector chunks to be indexed in ${expectedBackend}, but count was ${workspaceVectorChunkCount}`
      );
    }

    const results = await searchSimilarEmbeddings({
      workspaceId: workspace.id,
      pageIds: [page.id],
      queryEmbedding: [1, 0, 0, 0],
      limit: 5,
      candidateLimit: 10,
    });

    if (!results.some((entry) => entry.pageId === page.id)) {
      throw new Error("Vector search did not return the smoke page");
    }

    logInfo("vector_store.smoke.completed", {
      configuredBackend: process.env.VECTOR_STORE_BACKEND || "json",
      effectiveReadBackend: status.effectiveReadBackend,
      fallbackActive: status.fallbackActive,
      resultCount: results.length,
      workspaceId: workspace.id,
      pageId: page.id,
    });

    console.log(
      JSON.stringify(
        {
          expectedBackend: expectedBackend || null,
          configuredBackend: process.env.VECTOR_STORE_BACKEND || "json",
          effectiveReadBackend: status.effectiveReadBackend,
          fallbackActive: status.fallbackActive,
          counts: status.workspaceCounts,
          topResult: results[0] || null,
        },
        null,
        2
      )
    );
  } finally {
    if (!keepData) {
      if (pageId) {
        await deletePageEmbeddings([pageId]);
      }
      if (workspaceId) {
        await prisma.workspace.delete({
          where: { id: workspaceId },
        }).catch(() => null);
      }
      if (userId) {
        await prisma.user.delete({
          where: { id: userId },
        }).catch(() => null);
      }
    }
  }
}

main()
  .catch((error) => {
    logError("vector_store.smoke.failed", error);
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
