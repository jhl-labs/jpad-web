import { expect, test } from "@playwright/test";

test.describe("OIDC SSO", () => {
  test("SSO-only 배포는 OIDC provider만 노출하고 로컬 인증을 비활성화한다", async ({
    page,
  }) => {
    const providersResponse = await page.request.get("/api/auth/providers");
    expect(providersResponse.ok()).toBeTruthy();

    const providers = (await providersResponse.json()) as Record<
      string,
      { id: string; name: string }
    >;

    expect(providers.credentials).toBeUndefined();
    expect(providers.oidc?.name).toBe("Acme SSO");

    await page.goto("/login");
    await expect(
      page.getByRole("button", { name: "Acme SSO로 계속하기" })
    ).toBeVisible();
    await expect(
      page.getByText("이 배포는 로컬 이메일/비밀번호 로그인이 비활성화되어 있습니다.")
    ).toBeVisible();
    await expect(page.getByLabel("이메일")).toHaveCount(0);

    await page.goto("/register");
    await expect(
      page.getByText("이 배포는 셀프 회원가입이 비활성화되어 있습니다.")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Acme SSO로 계속하기" })
    ).toBeVisible();

    const registerResponse = await page.request.post("/api/auth/register", {
      data: {
        name: "oidc-user",
        email: "oidc-user@example.com",
        password: "password1234",
      },
    });
    expect(registerResponse.status()).toBe(403);
  });
});
