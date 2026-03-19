import { describe, it, expect, mock, beforeEach } from "bun:test";

// Mock prisma before importing the module under test
const mockCreate = mock(() =>
  Promise.resolve({
    id: "audit-1",
    action: "test.action",
    status: "success",
    createdAt: new Date(),
  })
);

mock.module("@/lib/prisma", () => ({
  prisma: {
    auditLog: {
      create: mockCreate,
    },
  },
}));

// Mock auditWebhook
mock.module("@/lib/auditWebhook", () => ({
  enqueueAuditWebhookDelivery: mock(() => Promise.resolve()),
}));

// Mock logger
const mockLogError = mock(() => {});
mock.module("@/lib/logger", () => ({
  logError: mockLogError,
  logWarn: () => {},
  logInfo: () => {},
  logRequest: () => {},
}));

// Mock requestContext
mock.module("@/lib/requestContext", () => ({
  getRequestContext: () => ({ requestId: null, ipAddress: null, userAgent: null }),
}));

const { recordAuditLog, createAuditActor } = await import("@/lib/audit");

describe("audit", () => {
  beforeEach(() => {
    mockCreate.mockClear();
    mockLogError.mockClear();
    delete process.env.DISABLE_AUDIT_LOGS;
  });

  it("recordAuditLog가 prisma.auditLog.create를 호출한다", async () => {
    await recordAuditLog({
      action: "page.created",
      actor: createAuditActor({ id: "user-1", email: "a@b.com" }),
      workspaceId: "ws-1",
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArg = mockCreate.mock.calls[0][0] as { data: { action: string; actorId: string; workspaceId: string } };
    expect(callArg.data.action).toBe("page.created");
    expect(callArg.data.actorId).toBe("user-1");
    expect(callArg.data.workspaceId).toBe("ws-1");
  });

  it("DISABLE_AUDIT_LOGS=1이면 기록하지 않는다", async () => {
    process.env.DISABLE_AUDIT_LOGS = "1";
    await recordAuditLog({ action: "page.created" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("DB 오류 시 logError를 호출한다", async () => {
    mockCreate.mockImplementationOnce(() => Promise.reject(new Error("DB down")));

    await recordAuditLog({ action: "page.deleted", workspaceId: "ws-2" });

    expect(mockLogError).toHaveBeenCalledTimes(1);
    const args = mockLogError.mock.calls[0] as [string, unknown, Record<string, unknown>];
    expect(args[0]).toBe("audit.log.write_failed");
  });

  it("createAuditActor가 올바른 구조를 반환한다", () => {
    const actor = createAuditActor(
      { id: "u1", email: "test@example.com", name: "Test" },
      "admin"
    );
    expect(actor).toEqual({
      id: "u1",
      email: "test@example.com",
      name: "Test",
      role: "admin",
    });
  });
});
