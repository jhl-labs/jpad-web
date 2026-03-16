import { describe, it, expect, mock, beforeEach } from "bun:test";

const mockCreate = mock(() =>
  Promise.resolve({
    id: "notif-1",
    userId: "user-1",
    type: "mention",
    title: "test",
    message: "msg",
    workspaceId: null,
    link: null,
    read: false,
    readAt: null,
    createdAt: new Date(),
  })
);

const mockCreateMany = mock(() => Promise.resolve({ count: 2 }));

mock.module("@/lib/prisma", () => ({
  prisma: {
    notification: {
      create: mockCreate,
      createMany: mockCreateMany,
    },
  },
}));

const { createNotification, createBulkNotifications } = await import(
  "@/lib/notifications"
);

describe("createNotification", () => {
  beforeEach(() => {
    mockCreate.mockClear();
    mockCreateMany.mockClear();
  });

  it("필수 인자로 알림을 생성한다", async () => {
    await createNotification("user-1", "mention", "멘션", "내용");

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArg = mockCreate.mock.calls[0][0] as {
      data: { userId: string; type: string; title: string; message: string; workspaceId: null; link: null };
    };
    expect(callArg.data.userId).toBe("user-1");
    expect(callArg.data.type).toBe("mention");
    expect(callArg.data.title).toBe("멘션");
    expect(callArg.data.message).toBe("내용");
    expect(callArg.data.workspaceId).toBeNull();
    expect(callArg.data.link).toBeNull();
  });

  it("옵션으로 workspaceId와 link를 전달한다", async () => {
    await createNotification("user-1", "todo_due", "할 일", "마감", {
      workspaceId: "ws-1",
      link: "/workspace/ws-1/todos",
    });

    const callArg = mockCreate.mock.calls[0][0] as {
      data: { workspaceId: string; link: string };
    };
    expect(callArg.data.workspaceId).toBe("ws-1");
    expect(callArg.data.link).toBe("/workspace/ws-1/todos");
  });
});

describe("createBulkNotifications", () => {
  beforeEach(() => {
    mockCreateMany.mockClear();
  });

  it("여러 사용자에게 알림을 생성한다", async () => {
    await createBulkNotifications(["u1", "u2"], "system", "공지", "내용");

    expect(mockCreateMany).toHaveBeenCalledTimes(1);
    const callArg = mockCreateMany.mock.calls[0][0] as {
      data: Array<{ userId: string }>;
    };
    expect(callArg.data).toHaveLength(2);
    expect(callArg.data[0].userId).toBe("u1");
    expect(callArg.data[1].userId).toBe("u2");
  });

  it("빈 배열이면 호출하지 않는다", async () => {
    await createBulkNotifications([], "system", "공지", "내용");
    expect(mockCreateMany).not.toHaveBeenCalled();
  });
});
