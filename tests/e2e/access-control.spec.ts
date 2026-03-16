import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import {
  createPage,
  createWorkspace,
  inviteWorkspaceMember,
  loginUser,
  registerAndLogin,
  registerUser,
  uniqueValue,
} from "./helpers";

const prisma = new PrismaClient();

test.describe("공유와 접근 제어", () => {
  const password = "testpassword123";

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("공개 링크로 로그인 없이 페이지를 읽을 수 있다", async ({
    page,
    browser,
  }) => {
    const ownerEmail = `${uniqueValue("share-owner")}@example.com`;
    const ownerName = uniqueValue("공유소유자");

    await registerAndLogin(page, ownerName, ownerEmail, password);
    await page.waitForURL("**/workspace**");

    const workspace = await createWorkspace(page, uniqueValue("공유워크스페이스"));
    const pageTitle = uniqueValue("공유페이지");
    const document = await createPage(page, workspace.id, pageTitle);
    const origin = new URL(page.url()).origin;

    await page.goto(`${origin}/workspace/${workspace.id}/page/${document.id}`);
    await expect(page.getByPlaceholder("제목 없음")).toHaveValue(pageTitle, {
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "공유", exact: true }).click();
    await page.getByRole("button", { name: "공개 링크 생성" }).click();

    const shareInput = page.locator('input[readonly]').first();
    await expect(shareInput).toHaveValue(/\/share\//);
    const shareUrl = await shareInput.inputValue();

    const guestContext = await browser.newContext({ baseURL: origin });
    const guestPage = await guestContext.newPage();

    await guestPage.goto(shareUrl);
    await expect(
      guestPage.getByRole("heading", { name: pageTitle }).first()
    ).toBeVisible();
    await expect(guestPage.getByText("Shared page")).toBeVisible();

    await guestContext.close();
  });

  test("제한된 페이지는 허용된 멤버만 열 수 있다", async ({
    page,
    browser,
  }) => {
    const ownerEmail = `${uniqueValue("acl-owner")}@example.com`;
    const ownerName = uniqueValue("ACL소유자");
    const viewerEmail = `${uniqueValue("acl-viewer")}@example.com`;
    const viewerName = uniqueValue("ACL뷰어");

    await registerUser(page, viewerName, viewerEmail, password);
    await registerAndLogin(page, ownerName, ownerEmail, password);
    await page.waitForURL("**/workspace**");

    const workspace = await createWorkspace(page, uniqueValue("ACL워크스페이스"));
    const pageTitle = uniqueValue("제한페이지");
    const document = await createPage(page, workspace.id, pageTitle);
    const origin = new URL(page.url()).origin;

    await inviteWorkspaceMember(page, workspace.id, viewerEmail, "viewer");

    await page.goto(`${origin}/workspace/${workspace.id}/page/${document.id}`);
    await expect(page.getByPlaceholder("제목 없음")).toHaveValue(pageTitle, {
      timeout: 15_000,
    });

    await page.getByRole("button", { name: "공유", exact: true }).click();
    await page.getByRole("button", { name: "제한된 멤버만" }).click();

    const viewerContext = await browser.newContext({ baseURL: origin });
    const viewerPage = await viewerContext.newPage();

    await loginUser(viewerPage, viewerEmail, password);
    await viewerPage.waitForURL("**/workspace**");
    const forbiddenPageResponse = await viewerPage.request.get(
      `/api/pages/${document.id}`
    );
    expect([403, 404]).toContain(forbiddenPageResponse.status());

    const memberCheckbox = page
      .locator("label")
      .filter({ hasText: viewerEmail })
      .locator('input[type="checkbox"]');
    await memberCheckbox.check();
    await expect(memberCheckbox).toBeChecked();

    await viewerPage.goto(`${origin}/workspace/${workspace.id}/page/${document.id}`);
    await expect(viewerPage.getByPlaceholder("제목 없음")).toHaveValue(pageTitle, {
      timeout: 15_000,
    });
    await expect(viewerPage.getByText("읽기 전용")).toBeVisible();

    const shareInfoResponse = await viewerPage.request.get(
      `/api/pages/${document.id}/share`
    );
    expect(shareInfoResponse.status()).toBe(403);

    const commentWriteResponse = await viewerPage.request.post(
      `/api/pages/${document.id}/comments`,
      {
        data: { content: "viewer should not write comments" },
      }
    );
    expect(commentWriteResponse.status()).toBe(403);

    const auditLogResponse = await viewerPage.request.get(
      `/api/workspaces/${workspace.id}/audit-logs`
    );
    expect(auditLogResponse.status()).toBe(403);

    const retentionRunsResponse = await viewerPage.request.get(
      `/api/workspaces/${workspace.id}/retention-runs`
    );
    expect(retentionRunsResponse.status()).toBe(403);

    const vectorStoreStatusResponse = await viewerPage.request.get(
      `/api/workspaces/${workspace.id}/ai/vector-store-status`
    );
    expect(vectorStoreStatusResponse.status()).toBe(403);

    await viewerContext.close();
  });

  test("기존 멤버의 역할은 초대 API로 변경할 수 없다", async ({ page }) => {
    const ownerEmail = `${uniqueValue("invite-owner")}@example.com`;
    const ownerName = uniqueValue("초대소유자");
    const memberEmail = `${uniqueValue("invite-member")}@example.com`;
    const memberName = uniqueValue("초대멤버");

    await registerUser(page, memberName, memberEmail, password);
    await registerAndLogin(page, ownerName, ownerEmail, password);
    await page.waitForURL("**/workspace**");

    const workspace = await createWorkspace(page, uniqueValue("초대워크스페이스"));

    await inviteWorkspaceMember(page, workspace.id, memberEmail, "viewer");

    const auditLogsResponse = await page.request.get(
      `/api/workspaces/${workspace.id}/audit-logs`
    );
    expect(auditLogsResponse.ok()).toBeTruthy();

    const auditLogs = (await auditLogsResponse.json()) as {
      data: Array<{ action: string; targetId: string | null }>;
    };
    expect(
      auditLogs.data.some(
        (entry) => entry.action === "workspace.member.invited"
      )
    ).toBeTruthy();

    const updateViaInvite = await page.request.post(
      `/api/workspaces/${workspace.id}/members`,
      {
        data: { email: memberEmail, role: "editor" },
      }
    );

    expect(updateViaInvite.status()).toBe(409);
  });

  test("관리자는 설정 화면에서 감사 로그를 조회할 수 있다", async ({ page }) => {
    const ownerEmail = `${uniqueValue("audit-owner")}@example.com`;
    const ownerName = uniqueValue("감사소유자");
    const memberEmail = `${uniqueValue("audit-member")}@example.com`;
    const memberName = uniqueValue("감사멤버");

    await registerUser(page, memberName, memberEmail, password);
    await registerAndLogin(page, ownerName, ownerEmail, password);
    await page.waitForURL("**/workspace**");

    const workspace = await createWorkspace(page, uniqueValue("감사워크스페이스"));
    await inviteWorkspaceMember(page, workspace.id, memberEmail, "viewer");

    await page.goto(`/workspace/${workspace.id}/settings`);
    await page.getByRole("button", { name: "감사 로그" }).click();

    const retentionRunsResponse = await page.request.get(
      `/api/workspaces/${workspace.id}/retention-runs`
    );
    expect(retentionRunsResponse.ok()).toBeTruthy();

    const vectorStoreStatusResponse = await page.request.get(
      `/api/workspaces/${workspace.id}/ai/vector-store-status`
    );
    expect(vectorStoreStatusResponse.ok()).toBeTruthy();

    await expect(page.getByText("감사 로그 검색")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Retention 실행 이력" })
    ).toBeVisible();
    await expect(
      page.locator("div").filter({ hasText: /^멤버 초대$/ }).first()
    ).toBeVisible();
    await expect(page.getByText("Request ID:")).toBeVisible();
  });

  test("페이지를 자기 하위 트리 아래로 이동할 수 없다", async ({ page }) => {
    const ownerEmail = `${uniqueValue("cycle-owner")}@example.com`;
    const ownerName = uniqueValue("사이클소유자");

    await registerAndLogin(page, ownerName, ownerEmail, password);
    await page.waitForURL("**/workspace**");

    const workspace = await createWorkspace(page, uniqueValue("사이클워크스페이스"));
    const parentPage = await createPage(page, workspace.id, uniqueValue("부모페이지"));
    const childPage = await createPage(page, workspace.id, uniqueValue("자식페이지"));

    const moveChild = await page.request.patch(`/api/pages/${childPage.id}`, {
      data: { parentId: parentPage.id },
    });
    expect(moveChild.ok()).toBeTruthy();

    const createCycle = await page.request.patch(`/api/pages/${parentPage.id}`, {
      data: { parentId: childPage.id },
    });
    expect(createCycle.status()).toBe(400);
  });

  test("public workspace 비멤버 viewer는 AI를 호출할 수 없다", async ({
    page,
    browser,
  }) => {
    const ownerEmail = `${uniqueValue("public-ai-owner")}@example.com`;
    const ownerName = uniqueValue("공개AI소유자");
    const outsiderEmail = `${uniqueValue("public-ai-outsider")}@example.com`;
    const outsiderName = uniqueValue("공개AI외부사용자");

    await registerUser(page, outsiderName, outsiderEmail, password);
    await registerAndLogin(page, ownerName, ownerEmail, password);
    await page.waitForURL("**/workspace**");

    const workspace = await createWorkspace(page, uniqueValue("공개AI워크스페이스"));
    const updateWorkspace = await page.request.patch(`/api/workspaces/${workspace.id}`, {
      data: { visibility: "public" },
    });
    expect(updateWorkspace.ok()).toBeTruthy();

    const origin = new URL(page.url()).origin;
    const outsiderContext = await browser.newContext({ baseURL: origin });
    const outsiderPage = await outsiderContext.newPage();

    await loginUser(outsiderPage, outsiderEmail, password);
    await outsiderPage.waitForURL("**/workspace**");

    const aiResponse = await outsiderPage.request.post("/api/ai/write", {
      data: {
        workspaceId: workspace.id,
        action: "summarize",
        text: "This should be rejected for public viewers.",
      },
    });
    expect(aiResponse.status()).toBe(403);

    await outsiderContext.close();
  });

  test("platform admin만 운영 대시보드와 운영 API에 접근할 수 있다", async ({
    page,
    browser,
  }) => {
    const adminEmail = "platform-admin@example.com";
    const adminName = "플랫폼관리자";
    const userEmail = `${uniqueValue("ops-user")}@example.com`;
    const userName = uniqueValue("운영일반사용자");

    await registerUser(page, adminName, adminEmail, password);
    await registerUser(page, userName, userEmail, password);

    await loginUser(page, adminEmail, password);
    await page.waitForURL("**/workspace**");

    const overviewResponse = await page.request.get("/api/admin/ops/overview");
    expect(overviewResponse.ok()).toBeTruthy();

    const backupsResponse = await page.request.get("/api/admin/ops/backups");
    expect(backupsResponse.ok()).toBeTruthy();

    const restoreDrillsResponse = await page.request.get(
      "/api/admin/ops/restore-drills"
    );
    expect(restoreDrillsResponse.ok()).toBeTruthy();

    const indexWorkersResponse = await page.request.get("/api/admin/ops/index-workers");
    expect(indexWorkersResponse.ok()).toBeTruthy();

    const auditDeliveriesResponse = await page.request.get(
      "/api/admin/ops/audit-log-deliveries"
    );
    expect(auditDeliveriesResponse.ok()).toBeTruthy();

    const vectorStoreStatusResponse = await page.request.get(
      "/api/admin/ops/vector-store-status"
    );
    expect(vectorStoreStatusResponse.ok()).toBeTruthy();

    await page.goto("/admin/ops");
    await page.waitForURL("**/admin/ops");
    await expect(page.getByText("운영 대시보드")).toBeVisible();
    await expect(page.getByText("Semantic Vector Store")).toBeVisible();
    await expect(page.getByRole("heading", { name: "백업 실행 이력" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "복구 검증 이력" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "검색 인덱싱 워커 이력" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "첨부 격리 검토" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "감사 로그 전달 이력" })).toBeVisible();

    const userContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
    const userPage = await userContext.newPage();

    await loginUser(userPage, userEmail, password);
    await userPage.waitForURL("**/workspace**");

    const forbiddenOverview = await userPage.request.get("/api/admin/ops/overview");
    expect(forbiddenOverview.status()).toBe(403);

    const forbiddenBackups = await userPage.request.get("/api/admin/ops/backups");
    expect(forbiddenBackups.status()).toBe(403);

    const forbiddenRestoreDrills = await userPage.request.get(
      "/api/admin/ops/restore-drills"
    );
    expect(forbiddenRestoreDrills.status()).toBe(403);

    const forbiddenIndexWorkers = await userPage.request.get("/api/admin/ops/index-workers");
    expect(forbiddenIndexWorkers.status()).toBe(403);

    const forbiddenAuditDeliveries = await userPage.request.get(
      "/api/admin/ops/audit-log-deliveries"
    );
    expect(forbiddenAuditDeliveries.status()).toBe(403);

    const forbiddenVectorStoreStatus = await userPage.request.get(
      "/api/admin/ops/vector-store-status"
    );
    expect(forbiddenVectorStoreStatus.status()).toBe(403);

    await userPage.goto("/admin/ops");
    await userPage.waitForURL("**/workspace");

    await userContext.close();
  });

  test("platform admin이 격리 첨부를 검토하고 다운로드를 복구할 수 있다", async ({
    page,
    browser,
  }) => {
    const adminEmail = "platform-admin@example.com";
    const adminName = "플랫폼보안관리자";
    const userEmail = `${uniqueValue("attachment-ops-user")}@example.com`;
    const userName = uniqueValue("첨부운영일반사용자");

    await registerUser(page, adminName, adminEmail, password);
    await registerUser(page, userName, userEmail, password);

    await loginUser(page, adminEmail, password);
    await page.waitForURL("**/workspace**");

    const workspace = await createWorkspace(page, uniqueValue("첨부보안워크스페이스"));
    const document = await createPage(page, workspace.id, uniqueValue("첨부보안문서"));
    const origin = new URL(page.url()).origin;

    const uploadResponse = await page.request.post("/api/upload", {
      multipart: {
        pageId: document.id,
        workspaceId: workspace.id,
        file: {
          name: "safe.pdf",
          mimeType: "application/pdf",
          buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"),
        },
      },
    });
    expect(uploadResponse.ok()).toBeTruthy();

    const uploadData = (await uploadResponse.json()) as { id: string };
    const attachmentId = uploadData.id;

    await prisma.attachment.update({
      where: { id: attachmentId },
      data: {
        securityStatus: "blocked",
        securityDisposition: null,
        securityScanner: "manual-test",
        securityFindings: [
          {
            code: "manual_block",
            severity: "high",
            message: "Manual quarantine for ops review test.",
          },
        ],
        securityCheckedAt: new Date(),
      },
    });

    const blockedDownload = await page.request.get(`/api/upload/${attachmentId}`);
    expect(blockedDownload.status()).toBe(423);

    const attachmentsResponse = await page.request.get(
      "/api/admin/ops/attachments?status=quarantined"
    );
    expect(attachmentsResponse.ok()).toBeTruthy();
    const attachmentsData = (await attachmentsResponse.json()) as {
      data: Array<{ id: string }>;
    };
    expect(attachmentsData.data.some((item) => item.id === attachmentId)).toBeTruthy();

    const releaseResponse = await page.request.post(
      `/api/admin/ops/attachments/${attachmentId}/release`,
      {
        data: { note: "운영 검토 후 수동 허용" },
      }
    );
    expect(releaseResponse.ok()).toBeTruthy();

    const releasedAttachment = await prisma.attachment.findUnique({
      where: { id: attachmentId },
      select: {
        securityDisposition: true,
        securityReviewedByUserId: true,
      },
    });
    expect(releasedAttachment?.securityDisposition).toBe("released");
    expect(releasedAttachment?.securityReviewedByUserId).toBeTruthy();

    const restoredDownload = await page.request.get(`/api/upload/${attachmentId}`);
    expect(restoredDownload.status()).toBe(200);

    const reblockResponse = await page.request.post(
      `/api/admin/ops/attachments/${attachmentId}/reblock`,
      {
        data: { note: "다시 격리" },
      }
    );
    expect(reblockResponse.ok()).toBeTruthy();

    const blockedAgainDownload = await page.request.get(`/api/upload/${attachmentId}`);
    expect(blockedAgainDownload.status()).toBe(423);

    const userContext = await browser.newContext({ baseURL: origin });
    const userPage = await userContext.newPage();

    await loginUser(userPage, userEmail, password);
    await userPage.waitForURL("**/workspace**");

    const forbiddenAttachments = await userPage.request.get(
      "/api/admin/ops/attachments?status=quarantined"
    );
    expect(forbiddenAttachments.status()).toBe(403);

    const forbiddenRelease = await userPage.request.post(
      `/api/admin/ops/attachments/${attachmentId}/release`,
      {
        data: {},
      }
    );
    expect(forbiddenRelease.status()).toBe(403);

    await userContext.close();
  });

  test("휴지통에서 페이지를 복원할 수 있다", async ({ page }) => {
    const ownerEmail = `${uniqueValue("trash-owner")}@example.com`;
    const ownerName = uniqueValue("휴지통소유자");

    await registerAndLogin(page, ownerName, ownerEmail, password);
    await page.waitForURL("**/workspace**");

    const workspace = await createWorkspace(page, uniqueValue("휴지통워크스페이스"));
    const pageTitle = uniqueValue("삭제페이지");
    const document = await createPage(page, workspace.id, pageTitle);
    const origin = new URL(page.url()).origin;

    const deleteResponse = await page.request.delete(`/api/pages/${document.id}`);
    expect(deleteResponse.ok()).toBeTruthy();

    await page.goto(`${origin}/workspace/${workspace.id}`);
    await page.getByRole("button", { name: "휴지통", exact: true }).click();

    await expect(page.getByText(pageTitle)).toBeVisible();
    await page.getByRole("button", { name: /복원/ }).click();
    await expect(page.getByText("휴지통이 비어있습니다")).toBeVisible();

    await page.goto(`${origin}/workspace/${workspace.id}/page/${document.id}`);
    await expect(page.getByPlaceholder("제목 없음")).toHaveValue(pageTitle, {
      timeout: 15_000,
    });
  });
});
