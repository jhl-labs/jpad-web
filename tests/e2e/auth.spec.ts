import { test, expect } from "@playwright/test";
import { loginUser } from "./helpers";

test.describe("인증", () => {
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

    try {
      // 회원가입 페이지에서 직접 가입
      await page.goto("/register");
      await page.getByLabel("이름").fill(name);
      await page.getByLabel("이메일").fill(uniqueEmail);
      await page.getByLabel("비밀번호").fill(password);
      await page.getByRole("button", { name: "회원가입" }).click();

      // 가입 후 자동으로 /workspace로 리다이렉트되는지 확인
      await page.waitForURL("**/workspace**");
      await expect(page).toHaveURL(/\/workspace/);
    } finally {
      // 테스트에서 생성한 유저를 정리합니다.
      // /test-utils/delete-user 엔드포인트가 구현되면 활성화하세요.
      try {
        await page.request.post("/test-utils/delete-user", {
          data: { email: uniqueEmail },
        });
      } catch (err) {
        console.error("Failed to delete test user:", uniqueEmail, err);
      }
    }
  });
});
