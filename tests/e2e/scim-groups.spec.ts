import { expect, test } from "@playwright/test";
import { registerAndLogin, uniqueValue } from "./helpers";

const password = "password1234";
const scimUserSchema = "urn:ietf:params:scim:schemas:core:2.0:User";
const scimGroupSchema = "urn:ietf:params:scim:schemas:core:2.0:Group";
const scimPatchSchema = "urn:ietf:params:scim:api:messages:2.0:PatchOp";

test.describe("SCIM 그룹 매핑", () => {
  test("조직 owner는 SCIM group을 workspace role에 매핑하고 수동 변경을 막을 수 있다", async ({
    page,
  }) => {
    const ownerEmail = `${uniqueValue("scim-group-owner")}@example.com`;
    const ownerName = uniqueValue("SCIM그룹오너");
    const organizationName = uniqueValue("SCIM그룹조직");
    const workspaceName = uniqueValue("SCIM그룹워크스페이스");
    const scimUserEmail = `${uniqueValue("group-member")}@example.com`;
    const scimGroupName = uniqueValue("Entra Editors");

    await registerAndLogin(page, ownerName, ownerEmail, password);
    await page.waitForURL("**/workspace**");

    const createOrganizationResponse = await page.request.post("/api/organizations", {
      data: { name: organizationName },
    });
    expect(createOrganizationResponse.ok()).toBeTruthy();
    const organization = (await createOrganizationResponse.json()) as { id: string };

    const createWorkspaceResponse = await page.request.post("/api/workspaces", {
      data: {
        name: workspaceName,
        organizationId: organization.id,
      },
    });
    expect(createWorkspaceResponse.ok()).toBeTruthy();
    const workspace = (await createWorkspaceResponse.json()) as { id: string };

    const createTokenResponse = await page.request.post(
      `/api/organizations/${organization.id}/scim-tokens`,
      {
        data: {
          label: "Entra Group Push",
        },
      }
    );
    expect(createTokenResponse.ok()).toBeTruthy();
    const scimToken = (await createTokenResponse.json()) as { token: string };

    const provisionUserResponse = await page.request.post("/api/scim/v2/Users", {
      headers: {
        Authorization: `Bearer ${scimToken.token}`,
      },
      data: {
        schemas: [scimUserSchema],
        userName: scimUserEmail,
        emails: [{ value: scimUserEmail, primary: true, type: "work" }],
        displayName: "Group Provisioned User",
        active: true,
      },
    });
    expect(provisionUserResponse.status()).toBe(201);
    const scimUser = (await provisionUserResponse.json()) as { id: string };

    const createGroupResponse = await page.request.post("/api/scim/v2/Groups", {
      headers: {
        Authorization: `Bearer ${scimToken.token}`,
      },
      data: {
        schemas: [scimGroupSchema],
        displayName: scimGroupName,
        members: [{ value: scimUser.id }],
      },
    });
    expect(createGroupResponse.status()).toBe(201);
    const scimGroup = (await createGroupResponse.json()) as { id: string };

    const createMappingResponse = await page.request.post(
      `/api/organizations/${organization.id}/scim-mappings`,
      {
        data: {
          workspaceId: workspace.id,
          scimGroupId: scimGroup.id,
          role: "editor",
        },
      }
    );
    expect(createMappingResponse.status()).toBe(201);

    await page.goto("/organizations");
    await expect(page.getByRole("heading", { name: organizationName })).toBeVisible();
    await expect(
      page.locator("div").filter({ hasText: new RegExp(`^${scimGroupName}$`) }).first()
    ).toBeVisible();
    await expect(page.getByRole("button", { name: workspaceName, exact: true })).toBeVisible();

    const workspaceResponse = await page.request.get(`/api/workspaces/${workspace.id}`);
    expect(workspaceResponse.ok()).toBeTruthy();
    const workspacePayload = (await workspaceResponse.json()) as {
      members: Array<{
        id: string;
        userId: string;
        role: string;
        managedByScim?: boolean;
        user: { email: string };
      }>;
    };
    const scimManagedMember = workspacePayload.members.find(
      (member) => member.user.email === scimUserEmail
    );
    expect(scimManagedMember?.role).toBe("editor");
    expect(scimManagedMember?.managedByScim).toBeTruthy();

    const patchManagedMemberResponse = await page.request.patch(
      `/api/workspaces/${workspace.id}/members/${scimManagedMember?.id}`,
      {
        data: {
          role: "viewer",
        },
      }
    );
    expect(patchManagedMemberResponse.status()).toBe(409);

    const removeManagedMemberResponse = await page.request.delete(
      `/api/workspaces/${workspace.id}/members`,
      {
        data: {
          userId: scimManagedMember?.userId,
        },
      }
    );
    expect(removeManagedMemberResponse.status()).toBe(409);

    const removeFromGroupResponse = await page.request.patch(
      `/api/scim/v2/Groups/${scimGroup.id}`,
      {
        headers: {
          Authorization: `Bearer ${scimToken.token}`,
        },
        data: {
          schemas: [scimPatchSchema],
          Operations: [
            {
              op: "Remove",
              path: `members[value eq "${scimUser.id}"]`,
            },
          ],
        },
      }
    );
    expect(removeFromGroupResponse.ok()).toBeTruthy();

    const workspaceAfterRemovalResponse = await page.request.get(
      `/api/workspaces/${workspace.id}`
    );
    expect(workspaceAfterRemovalResponse.ok()).toBeTruthy();
    const workspaceAfterRemoval = (await workspaceAfterRemovalResponse.json()) as {
      members: Array<{ user: { email: string } }>;
    };
    expect(
      workspaceAfterRemoval.members.some((member) => member.user.email === scimUserEmail)
    ).toBeFalsy();
  });
});
