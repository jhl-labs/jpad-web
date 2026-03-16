import { expect, test } from "@playwright/test";
import { registerAndLogin, registerUser, uniqueValue } from "./helpers";

const password = "password1234";

test.describe("조직", () => {
  test("조직 owner는 조직 워크스페이스와 도메인 정책을 관리할 수 있다", async ({
    page,
    browser,
  }) => {
    const ownerEmail = `${uniqueValue("org-owner")}@example.com`;
    const ownerName = uniqueValue("조직오너");
    const organizationName = uniqueValue("엔터프라이즈조직");
    const workspaceName = uniqueValue("조직워크스페이스");
    const outsiderEmail = `${uniqueValue("org-outsider")}@example.com`;
    const outsiderName = uniqueValue("조직외부자");
    const organizationDomain = `${uniqueValue("corp")}.invalid`;

    await registerAndLogin(page, ownerName, ownerEmail, password);
    await page.waitForURL("**/workspace**");

    const createOrganizationResponse = await page.request.post("/api/organizations", {
      data: {
        name: organizationName,
        description: "엔터프라이즈 조직 테스트",
      },
    });
    expect(createOrganizationResponse.ok()).toBeTruthy();
    const organization = (await createOrganizationResponse.json()) as {
      id: string;
      name: string;
      currentRole: string;
    };
    expect(organization.currentRole).toBe("owner");

    await page.goto("/organizations");
    await expect(
      page.getByRole("heading", { name: organizationName })
    ).toBeVisible();

    const addDomainResponse = await page.request.post(
      `/api/organizations/${organization.id}/domains`,
      {
        data: {
          domain: organizationDomain,
          autoJoin: true,
        },
      }
    );
    expect(addDomainResponse.ok()).toBeTruthy();
    const domain = (await addDomainResponse.json()) as {
      id: string;
      verification: { txtRecordName: string; txtRecordValue: string };
    };
    expect(domain.verification.txtRecordName).toBe(`_jpad.${organizationDomain}`);
    expect(domain.verification.txtRecordValue).toContain("jpad-domain-verification=");

    const verifyDomainResponse = await page.request.post(
      `/api/organizations/${organization.id}/domains/${domain.id}/verify`
    );
    expect(verifyDomainResponse.status()).toBe(400);

    const createWorkspaceResponse = await page.request.post("/api/workspaces", {
      data: {
        name: workspaceName,
        organizationId: organization.id,
      },
    });
    expect(createWorkspaceResponse.ok()).toBeTruthy();
    const workspace = (await createWorkspaceResponse.json()) as {
      id: string;
      organization: { id: string; name: string; slug: string };
    };
    expect(workspace.organization.id).toBe(organization.id);

    await page.goto("/workspace");
    await expect(page.getByRole("button", { name: "조직", exact: true })).toBeVisible();
    await expect(page.getByText(organizationName)).toBeVisible();

    const workspacesResponse = await page.request.get("/api/workspaces");
    expect(workspacesResponse.ok()).toBeTruthy();
    const workspaces = (await workspacesResponse.json()) as Array<{
      id: string;
      organization?: { id: string; name: string };
    }>;
    const createdWorkspace = workspaces.find((entry) => entry.id === workspace.id);
    expect(createdWorkspace?.organization?.id).toBe(organization.id);

    await registerUser(page, outsiderName, outsiderEmail, password);
    const outsiderContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
    const outsiderPage = await outsiderContext.newPage();

    await outsiderPage.goto("/login");
    await outsiderPage.getByLabel("이메일").fill(outsiderEmail);
    await outsiderPage.getByLabel("비밀번호").fill(password);
    await outsiderPage.getByRole("button", { name: "로그인" }).click();
    await outsiderPage.waitForURL("**/workspace**");

    const forbiddenWorkspaceResponse = await outsiderPage.request.post("/api/workspaces", {
      data: {
        name: uniqueValue("금지조직워크스페이스"),
        organizationId: organization.id,
      },
    });
    expect(forbiddenWorkspaceResponse.status()).toBe(403);

    await outsiderContext.close();
  });
});
