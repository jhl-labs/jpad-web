import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

test.describe("SAML Keycloak Smoke", () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("Keycloak SAML 로그인 후 workspace로 돌아오고 사용자가 연결된다", async ({
    page,
  }) => {
    await page.goto("/login");

    await expect(
      page.getByRole("button", {
        name: /Keycloak SAML로 계속하기|Single Sign-On로 계속하기/,
      })
    ).toBeVisible();
    await expect(
      page.getByText("이 배포는 로컬 이메일/비밀번호 로그인이 비활성화되어 있습니다.")
    ).toBeVisible();

    await page
      .getByRole("button", {
        name: /Keycloak SAML로 계속하기|Single Sign-On로 계속하기/,
      })
      .click();

    await page.waitForURL(/\/realms\/jpad\//, { timeout: 20_000 });
    await page.locator('input[name="username"]').fill("saml-smoke-user@example.com");
    await page.locator('input[name="password"]').fill("SmokePassword123!");
    await page.getByRole("button", { name: /Sign In|로그인/i }).click();

    await page.waitForURL("**/workspace**", { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "워크스페이스" })).toBeVisible();

    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: "saml-smoke-user@example.com",
          mode: "insensitive",
        },
      },
      select: {
        email: true,
        name: true,
        samlIssuer: true,
        samlSubject: true,
        lastLoginAt: true,
      },
    });

    expect(user?.email).toBe("saml-smoke-user@example.com");
    expect(user?.samlIssuer).toContain("/realms/jpad");
    expect(user?.samlSubject).toBeTruthy();
    expect(user?.lastLoginAt).toBeTruthy();
  });
});
