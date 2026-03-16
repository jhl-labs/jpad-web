import { expect, test } from "@playwright/test";
import { loginUser, registerAndLogin, registerUser, uniqueValue } from "./helpers";

const password = "password1234";
const scimUserSchema = "urn:ietf:params:scim:schemas:core:2.0:User";
const scimPatchSchema = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

test.describe("SCIM 프로비저닝", () => {
  test("조직 owner는 SCIM 토큰으로 사용자를 provision/deprovision 할 수 있다", async ({
    page,
    browser,
  }) => {
    const ownerEmail = `${uniqueValue("scim-owner")}@example.com`;
    const ownerName = uniqueValue("SCIM오너");
    const outsiderEmail = `${uniqueValue("scim-outsider")}@example.com`;
    const outsiderName = uniqueValue("SCIM외부자");
    const organizationName = uniqueValue("SCIM조직");
    const provisionedEmail = `${uniqueValue("scim-user")}@example.com`;

    await registerUser(page, outsiderName, outsiderEmail, password);
    await registerAndLogin(page, ownerName, ownerEmail, password);
    await page.waitForURL("**/workspace**");

    const createOrganizationResponse = await page.request.post("/api/organizations", {
      data: {
        name: organizationName,
      },
    });
    expect(createOrganizationResponse.ok()).toBeTruthy();
    const organization = (await createOrganizationResponse.json()) as {
      id: string;
    };

    const outsiderContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
    const outsiderPage = await outsiderContext.newPage();
    await loginUser(outsiderPage, outsiderEmail, password);
    await outsiderPage.waitForURL("**/workspace**");

    const forbiddenTokenResponse = await outsiderPage.request.post(
      `/api/organizations/${organization.id}/scim-tokens`,
      {
        data: {
          label: "forbidden",
        },
      }
    );
    expect(forbiddenTokenResponse.status()).toBe(403);

    const createTokenResponse = await page.request.post(
      `/api/organizations/${organization.id}/scim-tokens`,
      {
        data: {
          label: "Okta Production",
        },
      }
    );
    expect(createTokenResponse.ok()).toBeTruthy();
    const createdToken = (await createTokenResponse.json()) as {
      id: string;
      token: string;
      scimBaseUrl: string;
    };
    expect(createdToken.scimBaseUrl).toContain("/api/scim/v2");

    await page.goto("/organizations");
    await expect(page.getByRole("heading", { name: organizationName })).toBeVisible();
    await expect(page.getByText("SCIM 프로비저닝")).toBeVisible();
    await expect(page.getByText("Okta Production")).toBeVisible();

    const serviceProviderConfigResponse = await page.request.get(
      "/api/scim/v2/ServiceProviderConfig",
      {
        headers: {
          Authorization: `Bearer ${createdToken.token}`,
        },
      }
    );
    expect(serviceProviderConfigResponse.ok()).toBeTruthy();

    const provisionUserResponse = await page.request.post("/api/scim/v2/Users", {
      headers: {
        Authorization: `Bearer ${createdToken.token}`,
      },
      data: {
        schemas: [scimUserSchema],
        externalId: uniqueValue("entra-id"),
        userName: provisionedEmail,
        displayName: "Provisioned User",
        name: {
          givenName: "Provisioned",
          familyName: "User",
        },
        emails: [
          {
            value: provisionedEmail,
            primary: true,
            type: "work",
          },
        ],
        active: true,
      },
    });
    expect(provisionUserResponse.status()).toBe(201);
    const scimUser = (await provisionUserResponse.json()) as {
      id: string;
      userName: string;
      active: boolean;
    };
    expect(scimUser.userName).toBe(provisionedEmail);
    expect(scimUser.active).toBeTruthy();

    const listUsersResponse = await page.request.get(
      `/api/scim/v2/Users?filter=${encodeURIComponent(`userName eq "${provisionedEmail}"`)}`,
      {
        headers: {
          Authorization: `Bearer ${createdToken.token}`,
        },
      }
    );
    expect(listUsersResponse.ok()).toBeTruthy();
    const listPayload = (await listUsersResponse.json()) as {
      totalResults: number;
      Resources: Array<{ id: string; active: boolean }>;
    };
    expect(listPayload.totalResults).toBe(1);
    expect(listPayload.Resources[0]?.id).toBe(scimUser.id);

    const organizationDetailResponse = await page.request.get(
      `/api/organizations/${organization.id}`
    );
    expect(organizationDetailResponse.ok()).toBeTruthy();
    const organizationDetail = (await organizationDetailResponse.json()) as {
      _count: { members: number };
    };
    expect(organizationDetail._count.members).toBe(2);

    const deactivateUserResponse = await page.request.patch(
      `/api/scim/v2/Users/${scimUser.id}`,
      {
        headers: {
          Authorization: `Bearer ${createdToken.token}`,
        },
        data: {
          schemas: [scimPatchSchema],
          Operations: [
            {
              op: "Replace",
              path: "active",
              value: false,
            },
          ],
        },
      }
    );
    expect(deactivateUserResponse.ok()).toBeTruthy();
    const deactivatedUser = (await deactivateUserResponse.json()) as {
      active: boolean;
    };
    expect(deactivatedUser.active).toBeFalsy();

    const organizationAfterDeactivateResponse = await page.request.get(
      `/api/organizations/${organization.id}`
    );
    expect(organizationAfterDeactivateResponse.ok()).toBeTruthy();
    const organizationAfterDeactivate = (await organizationAfterDeactivateResponse.json()) as {
      _count: { members: number };
    };
    expect(organizationAfterDeactivate._count.members).toBe(1);

    const revokeTokenResponse = await page.request.delete(
      `/api/organizations/${organization.id}/scim-tokens/${createdToken.id}`
    );
    expect(revokeTokenResponse.ok()).toBeTruthy();

    const revokedTokenAccess = await page.request.get("/api/scim/v2/Users", {
      headers: {
        Authorization: `Bearer ${createdToken.token}`,
      },
    });
    expect(revokedTokenAccess.status()).toBe(401);

    await outsiderContext.close();
  });
});
