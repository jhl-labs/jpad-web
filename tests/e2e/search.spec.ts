import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { expect, test } from "@playwright/test";
import { createPage, createWorkspace, loginUser, uniqueValue } from "./helpers";

const prisma = new PrismaClient();

test.describe("검색", () => {
  const password = "testpassword123";

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("최근 문서와 본문 스니펫 검색을 제공한다", async ({ page }) => {
    const ownerEmail = `${uniqueValue("search-owner")}@example.com`;
    const ownerName = uniqueValue("검색소유자");
    const workspaceName = uniqueValue("검색워크스페이스");
    const pageTitle = uniqueValue("검색문서");
    const uniquePhrase = uniqueValue("semantic-keyword");

    await prisma.user.create({
      data: {
        email: ownerEmail,
        name: ownerName,
        hashedPassword: await bcrypt.hash(password, 12),
      },
    });

    await loginUser(page, ownerEmail, password);
    await page.waitForURL("**/workspace**");

    const workspace = await createWorkspace(page, workspaceName);
    const document = await createPage(page, workspace.id, pageTitle);

    const saveResponse = await page.request.put(`/api/pages/${document.id}/content`, {
      data: {
        content: `# ${pageTitle}\n\n이 문서는 검색 테스트용입니다.\n\n${uniquePhrase} 라는 고유한 문구가 들어 있습니다.`,
      },
    });
    expect(saveResponse.ok()).toBeTruthy();

    const reindexResponse = await page.request.post(
      `/api/workspaces/${workspace.id}/ai/reindex`,
      {
        data: { dryRun: true },
      }
    );
    expect(reindexResponse.ok()).toBeTruthy();
    const reindexPayload = (await reindexResponse.json()) as {
      summary: { totalPages: number; indexedPages: number; disabledPages: number };
    };
    expect(reindexPayload.summary.totalPages).toBeGreaterThanOrEqual(1);
    expect(
      reindexPayload.summary.indexedPages + reindexPayload.summary.disabledPages
    ).toBeGreaterThanOrEqual(1);

    const queuedReindexResponse = await page.request.post(
      `/api/workspaces/${workspace.id}/ai/reindex`,
      {
        data: { dryRun: false },
      }
    );
    expect(queuedReindexResponse.ok()).toBeTruthy();
    const queuedReindexPayload = (await queuedReindexResponse.json()) as {
      queued: boolean;
      job: { id: string; status: string };
    };
    expect(queuedReindexPayload.queued).toBeTruthy();
    expect(queuedReindexPayload.job.id).toBeTruthy();

    const processJobsResponse = await page.request.post(
      `/api/workspaces/${workspace.id}/ai/process-index-jobs`,
      {
        data: { limit: 10 },
      }
    );
    expect(processJobsResponse.ok()).toBeTruthy();
    const processJobsPayload = (await processJobsResponse.json()) as {
      runId: string;
      processedCount: number;
      successCount: number;
      errorCount: number;
    };
    expect(processJobsPayload.runId).toBeTruthy();

    const indexJobsResponse = await page.request.get(
      `/api/workspaces/${workspace.id}/ai/index-jobs?limit=10`
    );
    expect(indexJobsResponse.ok()).toBeTruthy();
    const indexJobsPayload = (await indexJobsResponse.json()) as {
      data: Array<{ id: string; jobType: string; status: string }>;
    };
    const queuedJob = indexJobsPayload.data.find(
      (entry) => entry.id === queuedReindexPayload.job.id
    );
    expect(queuedJob).toBeTruthy();
    expect(queuedJob?.jobType).toBe("workspace_reindex");

    const workerRunsResponse = await page.request.get(
      `/api/workspaces/${workspace.id}/ai/index-worker-runs?limit=10`
    );
    expect(workerRunsResponse.ok()).toBeTruthy();
    const workerRunsPayload = (await workerRunsResponse.json()) as {
      data: Array<{
        searchIndexWorkerRunId: string;
        summary: { processedJobCount: number };
      }>;
    };
    const workerRun = workerRunsPayload.data.find(
      (entry) => entry.searchIndexWorkerRunId === processJobsPayload.runId
    );
    expect(workerRun).toBeTruthy();
    expect(workerRun?.summary.processedJobCount).toBeGreaterThanOrEqual(0);

    const recentResponse = await page.request.get(
      `/api/pages/search?workspaceId=${workspace.id}&q=`
    );
    expect(recentResponse.ok()).toBeTruthy();
    const recentResults = (await recentResponse.json()) as Array<{
      id: string;
      matchType?: string;
    }>;
    expect(recentResults.some((entry) => entry.id === document.id)).toBeTruthy();
    expect(recentResults.some((entry) => entry.matchType === "recent")).toBeTruthy();

    const contentSearchResponse = await page.request.get(
      `/api/pages/search?workspaceId=${workspace.id}&q=${encodeURIComponent(uniquePhrase)}`
    );
    expect(contentSearchResponse.ok()).toBeTruthy();
    const contentResults = (await contentSearchResponse.json()) as Array<{
      id: string;
      snippet: string | null;
      matchType?: string;
    }>;
    const match = contentResults.find((entry) => entry.id === document.id);

    expect(match).toBeTruthy();
    expect(match?.snippet).toContain(uniquePhrase);
    expect(["content", "semantic"]).toContain(match?.matchType || "");
  });
});
