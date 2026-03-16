import { test, expect } from "@playwright/test";
import { registerAndLogin } from "./helpers";

test.describe("워크스페이스", () => {
  const password = "testpassword123";
  let testEmail: string;
  let testName: string;

  test.beforeEach(async ({ page }) => {
    testEmail = `ws-test-${Date.now()}@example.com`;
    testName = `테스트유저-${Date.now()}`;
    await registerAndLogin(page, testName, testEmail, password);
    await page.waitForURL("**/workspace**");
  });

  test("워크스페이스 생성", async ({ page }) => {
    // "새 워크스페이스" 버튼 클릭
    await page.getByRole("button", { name: /새 워크스페이스/ }).click();

    // 워크스페이스 이름 입력 후 생성
    const wsName = `테스트WS-${Date.now()}`;
    await page.getByPlaceholder("워크스페이스 이름").fill(wsName);
    await page.getByRole("button", { name: "생성" }).click();

    // 워크스페이스 상세 페이지로 이동 확인
    await page.waitForURL("**/workspace/**");
    await expect(page).toHaveURL(/\/workspace\/.+/);
  });

  test("페이지 생성 및 제목 편집", async ({ page }) => {
    // API로 워크스페이스 생성
    const wsRes = await page.request.post("/api/workspaces", {
      data: { name: `페이지테스트WS-${Date.now()}` },
    });
    expect(wsRes.ok()).toBeTruthy();
    const ws = await wsRes.json();

    // 워크스페이스로 이동
    await page.goto(`/workspace/${ws.id}`);
    await page.waitForLoadState("networkidle");

    // 사이드바에서 새 페이지 버튼 클릭 (title="새 페이지"인 Plus 버튼)
    await page.getByTitle("새 페이지").click();

    // 페이지 에디터로 이동 확인
    await page.waitForURL("**/page/**");
    await expect(page).toHaveURL(/\/workspace\/.+\/page\/.+/);

    // 제목 편집
    const titleInput = page.getByPlaceholder("제목 없음");
    await expect(titleInput).toBeVisible();
    const newTitle = `테스트페이지-${Date.now()}`;
    await titleInput.fill(newTitle);
    await expect(titleInput).toHaveValue(newTitle);
  });
});
