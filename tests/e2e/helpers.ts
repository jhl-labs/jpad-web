import { expect, Page } from "@playwright/test";

export interface WorkspaceRecord {
  id: string;
  name: string;
  slug: string;
}

export interface PageRecord {
  id: string;
  title: string;
  slug: string;
  workspaceId: string;
}

export function uniqueValue(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function registerUser(
  page: Page,
  name: string,
  email: string,
  password: string,
) {
  const res = await page.request.post("/api/auth/register", {
    data: { name, email, password },
  });

  if (!res.ok() && res.status() !== 409) {
    throw new Error(`회원가입 실패: ${res.status()} ${await res.text()}`);
  }
}

/**
 * 로그인 폼을 채우고 제출합니다.
 */
export async function loginUser(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
}

/**
 * API를 통해 회원가입한 후 로그인 폼으로 로그인합니다.
 */
export async function registerAndLogin(
  page: Page,
  name: string,
  email: string,
  password: string,
) {
  await registerUser(page, name, email, password);

  // 로그인 폼으로 로그인
  await loginUser(page, email, password);
}

export async function createWorkspace(
  page: Page,
  name: string,
): Promise<WorkspaceRecord> {
  const res = await page.request.post("/api/workspaces", {
    data: { name },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as WorkspaceRecord;
}

export async function createPage(
  page: Page,
  workspaceId: string,
  title: string,
): Promise<PageRecord> {
  const res = await page.request.post("/api/pages", {
    data: { workspaceId, title },
  });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as PageRecord;
}

export async function inviteWorkspaceMember(
  page: Page,
  workspaceId: string,
  email: string,
  role: "admin" | "editor" | "viewer" = "viewer",
) {
  const res = await page.request.post(`/api/workspaces/${workspaceId}/members`, {
    data: { email, role },
  });
  expect(res.ok()).toBeTruthy();
}
