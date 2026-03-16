import { test, expect } from "@playwright/test";
import { loginUser } from "./helpers";

test.describe("인증", () => {
  let lastCreatedEmail: string | null = null;

  test("비인증 사용자는 /workspace 접근 시 /login으로 리다이렉트", async ({
    page,
  }) => {
    await page.goto("/workspace");
    await page.waitForURL("**/login**");
    await expect(page).toHaveURL(/\/login/);
  });

  test("잘못된 자격 증명으로 로그인 시 에러 표시", async ({ page }) => {
    await loginUser(page, "wrong@example.com", "wrongpassword");
    await expect(
      page.getByText("이메일 또는 비밀번호가 올바르지 않습니다"),
    ).toBeVisible();
  });

  test("회원가입 → 로그인 → 워크스페이스 접근", async ({ page }) => {
    const uniqueEmail = `test-${Date.now()}@example.com`;
    const password = "testpassword123";
    const name = "테스트유저";

    // 생성된 테스트 유저 이메일을 추적하여 테스트 후 정리
    lastCreatedEmail = uniqueEmail;

    // 회원가입 페이지에서 직접 가입
    await page.goto("/register");
    await page.getByLabel("이름").fill(name);
    await page.getByLabel("이메일").fill(uniqueEmail);
    await page.getByLabel("비밀번호").fill(password);
    await page.getByRole("button", { name: "회원가입" }).click();

    // 가입 후 자동으로 /workspace로 리다이렉트되는지 확인
    await page.waitForURL("**/workspace**");
    await expect(page).toHaveURL(/\/workspace/);
  });

  test.afterEach(async ({ page }) => {
    if (!lastCreatedEmail) {
      return;
    }

    // 테스트에서 생성한 유저를 정리합니다.
    // 실제 구현에서는 애플리케이션의 테스트 전용 삭제 엔드포인트나
    // 관리자 API를 호출하도록 이 부분을 맞춰주세요.
    await page.request.post("/test-utils/delete-user", {
      data: { email: lastCreatedEmail },
    });

    lastCreatedEmail = null;
  });
});
