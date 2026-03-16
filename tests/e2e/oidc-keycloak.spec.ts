import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

test.describe("OIDC Keycloak Smoke", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("Keycloak 로그인 후 workspace로 돌아오고 OIDC 사용자가 연결된다", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("button", { name: /Keycloak SSO로 계속하기|Acme SSO로 계속하기/ })
    ).toBeVisible();
    await expect(
      page.getByText("이 배포는 로컬 이메일/비밀번호 로그인이 비활성화되어 있습니다.")
    ).toBeVisible();

    await page.getByRole("button", { name: /Keycloak SSO로 계속하기|Acme SSO로 계속하기/ }).click();

    await page.waitForURL(/\/realms\/jpad\//, { timeout: 20_000 });
    await page.locator('input[name="username"]').fill("oidc-smoke-user");
    await page.locator('input[name="password"]').fill("SmokePassword123!");
    await page.getByRole("button", { name: /Sign In|로그인/i }).click();

    await page.waitForURL("**/workspace**", { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "워크스페이스" })).toBeVisible();

    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: "oidc-smoke-user@example.com",
          mode: "insensitive",
        },
      },
      select: {
        email: true,
        name: true,
        oidcIssuer: true,
        oidcSubject: true,
        lastLoginAt: true,
      },
    });

    expect(user?.email).toBe("oidc-smoke-user@example.com");
    expect(user?.oidcIssuer).toContain("/realms/jpad");
    expect(user?.oidcSubject).toBeTruthy();
    expect(user?.lastLoginAt).toBeTruthy();
  });
});
