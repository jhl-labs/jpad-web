"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Globe, Link2, X } from "lucide-react";

interface Member {
  id: string;
  role: string;
  managedByScim?: boolean;
  hasScimProvisionedAccess?: boolean;
  user: { id: string; name: string; email: string };
}

interface WorkspacePayload {
  name: string;
  currentRole: string;
  publicWikiEnabled: boolean;
  members: Member[];
}

interface PageShareLink {
  token: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

interface PagePermissionUser {
  id: string;
  name: string;
  email: string;
}

export function ShareDialog({
  workspaceId,
  pageId,
  pageTitle,
  onClose,
}: {
  workspaceId: string;
  pageId?: string;
  pageTitle?: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [workspaceRole, setWorkspaceRole] = useState<string>("viewer");
  const [publicWikiEnabled, setPublicWikiEnabled] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("editor");
  const [error, setError] = useState("");
  const [pageShare, setPageShare] = useState<PageShareLink | null>(null);
  const [pageAccessMode, setPageAccessMode] = useState<"workspace" | "restricted">("workspace");
  const [pageAllowedUserIds, setPageAllowedUserIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // ESC 키로 닫기
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [onClose]);

  // 열릴 때 첫 입력 필드에 포커스
  useEffect(() => {
    if (dialogRef.current) {
      const firstInput = dialogRef.current.querySelector<HTMLElement>(
        'input:not([readonly]), select, textarea, button'
      );
      firstInput?.focus();
    }
  }, []);

  const canManageWorkspace = workspaceRole === "owner" || workspaceRole === "admin";
  const canManagePageShare = workspaceRole !== "viewer";
  const canManagePageAcl = workspaceRole !== "viewer";

  const publicWikiUrl = useMemo(() => {
    if (!origin) return "";
    return `${origin}/wiki/${workspaceId}`;
  }, [origin, workspaceId]);

  const publicPageUrl = useMemo(() => {
    if (!origin || !pageShare) return "";
    return `${origin}/share/${pageShare.token}`;
  }, [origin, pageShare]);

  const loadWorkspace = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}`);
    if (!res.ok) throw new Error("워크스페이스 정보를 불러오지 못했습니다.");

    const data: WorkspacePayload = await res.json();
    setMembers(data.members || []);
    setWorkspaceRole(data.currentRole);
    setPublicWikiEnabled(Boolean(data.publicWikiEnabled));
  }, [workspaceId]);

  const loadPageShare = useCallback(async () => {
    if (!pageId) {
      setPageShare(null);
      return;
    }

    const res = await fetch(`/api/pages/${pageId}/share`);
    if (!res.ok) throw new Error("페이지 공유 링크를 불러오지 못했습니다.");

    const data: { shareLink: PageShareLink | null } = await res.json();
    setPageShare(data.shareLink);
  }, [pageId]);

  const loadPagePermissions = useCallback(async () => {
    if (!pageId) return;

    const res = await fetch(`/api/pages/${pageId}/permissions`);
    if (!res.ok) throw new Error("페이지 접근 권한을 불러오지 못했습니다.");

    const data: {
      accessMode: "workspace" | "restricted";
      allowedUsers: PagePermissionUser[];
    } = await res.json();

    setPageAccessMode(data.accessMode);
    setPageAllowedUserIds(data.allowedUsers.map((user) => user.id));
  }, [pageId]);

  useEffect(() => {
    Promise.all([loadWorkspace(), loadPageShare(), loadPagePermissions()]).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "공유 정보를 불러오지 못했습니다.");
    });
  }, [loadWorkspace, loadPageShare, loadPagePermissions]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!canManageWorkspace) return;
    setError("");

    const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "초대에 실패했습니다." }));
      setError(data.error || "초대에 실패했습니다.");
      return;
    }

    setEmail("");
    await loadWorkspace();
  }

  async function handleRemove(userId: string) {
    if (!canManageWorkspace) return;
    if (!confirm("이 멤버를 워크스페이스에서 제거하시겠습니까?")) return;

    const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    if (res.ok) {
      setMembers((prev) => prev.filter((member) => member.user.id !== userId));
    }
  }

  async function handleTogglePublicWiki() {
    if (!canManageWorkspace || busy) return;

    setBusy(true);
    setError("");
    const nextValue = !publicWikiEnabled;

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicWikiEnabled: nextValue }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "공개 위키 변경에 실패했습니다." }));
        throw new Error(data.error || "공개 위키 변경에 실패했습니다.");
      }

      setPublicWikiEnabled(nextValue);
    } catch (err) {
      setError(err instanceof Error ? err.message : "공개 위키 변경에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreatePageShare() {
    if (!pageId || !canManagePageShare || busy) return;

    setBusy(true);
    setError("");

    try {
      const res = await fetch(`/api/pages/${pageId}/share`, {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "공유 링크 생성에 실패했습니다." }));
        throw new Error(data.error || "공유 링크 생성에 실패했습니다.");
      }

      const data: { shareLink: PageShareLink | null } = await res.json();
      setPageShare(data.shareLink);
    } catch (err) {
      setError(err instanceof Error ? err.message : "공유 링크 생성에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRevokePageShare() {
    if (!pageId || !canManagePageShare || busy) return;

    setBusy(true);
    setError("");

    try {
      const res = await fetch(`/api/pages/${pageId}/share`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "공유 링크 해제에 실패했습니다." }));
        throw new Error(data.error || "공유 링크 해제에 실패했습니다.");
      }

      setPageShare(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "공유 링크 해제에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function copyToClipboard(value: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError("클립보드 복사에 실패했습니다.");
    }
  }

  async function updatePagePermissions(
    accessMode: "workspace" | "restricted",
    userIds: string[]
  ) {
    if (!pageId || !canManagePageAcl || busy) return;

    setBusy(true);
    setError("");

    try {
      const res = await fetch(`/api/pages/${pageId}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessMode, userIds }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "페이지 권한 저장에 실패했습니다." }));
        throw new Error(data.error || "페이지 권한 저장에 실패했습니다.");
      }

      const data: {
        accessMode: "workspace" | "restricted";
        allowedUsers: PagePermissionUser[];
      } = await res.json();

      setPageAccessMode(data.accessMode);
      setPageAllowedUserIds(data.allowedUsers.map((user) => user.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "페이지 권한 저장에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  const implicitAccessUserIds = useMemo(
    () =>
      members
        .filter((member) => member.role === "owner" || member.role === "admin")
        .map((member) => member.user.id),
    [members]
  );

  const selectableMembers = useMemo(
    () =>
      members.filter(
        (member) => member.role !== "owner" && member.role !== "admin"
      ),
    [members]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-dialog-title"
        className="w-full max-w-2xl rounded-lg p-6 max-h-[85vh] overflow-auto"
        style={{ background: "var(--background)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 id="share-dialog-title" className="font-semibold">공유 설정</h3>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-6">
          {pageId && (
            <section>
              <div className="flex items-center gap-2 mb-2">
                <Link2 size={16} />
                <h4 className="font-medium text-sm">
                  페이지 접근 권한{pageTitle ? ` · ${pageTitle}` : ""}
                </h4>
              </div>
              <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
                제한 모드에서는 선택된 멤버와 관리자만 이 페이지를 볼 수 있습니다.
              </p>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => updatePagePermissions("workspace", pageAllowedUserIds)}
                  disabled={!canManagePageAcl || busy}
                  className="px-3 py-2 rounded-md text-sm disabled:opacity-60"
                  style={{
                    background: pageAccessMode === "workspace" ? "var(--primary)" : "transparent",
                    color: pageAccessMode === "workspace" ? "white" : "var(--foreground)",
                    border: "1px solid var(--border)",
                  }}
                >
                  워크스페이스 전체
                </button>
                <button
                  onClick={() => updatePagePermissions("restricted", pageAllowedUserIds)}
                  disabled={!canManagePageAcl || busy}
                  className="px-3 py-2 rounded-md text-sm disabled:opacity-60"
                  style={{
                    background: pageAccessMode === "restricted" ? "var(--primary)" : "transparent",
                    color: pageAccessMode === "restricted" ? "white" : "var(--foreground)",
                    border: "1px solid var(--border)",
                  }}
                >
                  제한된 멤버만
                </button>
              </div>
              {pageAccessMode === "restricted" && (
                <div
                  className="rounded-md p-3 mb-4"
                  style={{ border: "1px solid var(--border)" }}
                >
                  <div className="space-y-2">
                    {members.map((member) => {
                      const isImplicit = implicitAccessUserIds.includes(member.user.id);
                      const checked =
                        isImplicit || pageAllowedUserIds.includes(member.user.id);

                      return (
                        <label
                          key={member.id}
                          className="flex items-center justify-between gap-3 text-sm"
                        >
                          <span>
                            {member.user.name}
                            <span style={{ color: "var(--muted)" }}>
                              {" "}
                              · {member.user.email}
                            </span>
                          </span>
                          {isImplicit ? (
                            <span
                              className="text-xs px-2 py-1 rounded"
                              style={{ background: "var(--sidebar-hover)" }}
                            >
                              항상 허용
                            </span>
                          ) : (
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!canManagePageAcl || busy}
                              onChange={(e) => {
                                const nextUserIds = e.target.checked
                                  ? [...new Set([...pageAllowedUserIds, member.user.id])]
                                  : pageAllowedUserIds.filter((id) => id !== member.user.id);
                                setPageAllowedUserIds(nextUserIds);
                                void updatePagePermissions("restricted", nextUserIds);
                              }}
                            />
                          )}
                        </label>
                      );
                    })}
                    {selectableMembers.length === 0 && (
                      <p className="text-sm" style={{ color: "var(--muted)" }}>
                        선택 가능한 일반 멤버가 없습니다.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 mb-2">
                <Link2 size={16} />
                <h4 className="font-medium text-sm">
                  페이지 공개 링크{pageTitle ? ` · ${pageTitle}` : ""}
                </h4>
              </div>
              <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
                이 링크는 로그인 없이 읽기 전용으로 페이지를 열 수 있습니다.
              </p>
              {pageShare ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={publicPageUrl}
                      className="flex-1 px-3 py-2 rounded-md text-sm"
                      style={{ border: "1px solid var(--border)" }}
                    />
                    <button
                      onClick={() => copyToClipboard(publicPageUrl)}
                      className="px-3 py-2 rounded-md text-sm"
                      style={{ border: "1px solid var(--border)" }}
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    {canManagePageShare && (
                      <>
                        <button
                          onClick={handleCreatePageShare}
                          disabled={busy}
                          className="px-3 py-2 rounded-md text-sm text-white disabled:opacity-60"
                          style={{ background: "var(--primary)" }}
                        >
                          링크 재생성
                        </button>
                        <button
                          onClick={handleRevokePageShare}
                          disabled={busy}
                          className="px-3 py-2 rounded-md text-sm disabled:opacity-60"
                          style={{ border: "1px solid var(--border)", color: "var(--danger)" }}
                        >
                          링크 해제
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleCreatePageShare}
                  disabled={!canManagePageShare || busy}
                  className="px-3 py-2 rounded-md text-sm text-white disabled:opacity-60"
                  style={{ background: "var(--primary)" }}
                >
                  공개 링크 생성
                </button>
              )}
            </section>
          )}

          <section>
            <div className="flex items-center gap-2 mb-2">
              <Globe size={16} />
              <h4 className="font-medium text-sm">공개 위키</h4>
            </div>
            <p className="text-sm mb-3" style={{ color: "var(--muted)" }}>
              전체 위키를 읽기 전용으로 외부에 공개합니다.
            </p>
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={handleTogglePublicWiki}
                disabled={!canManageWorkspace || busy}
                className="px-3 py-2 rounded-md text-sm text-white disabled:opacity-60"
                style={{ background: publicWikiEnabled ? "#ef4444" : "var(--primary)" }}
              >
                {publicWikiEnabled ? "공개 위키 비활성화" : "공개 위키 활성화"}
              </button>
              {publicWikiEnabled && (
                <button
                  onClick={() => copyToClipboard(publicWikiUrl)}
                  className="px-3 py-2 rounded-md text-sm"
                  style={{ border: "1px solid var(--border)" }}
                >
                  위키 링크 복사
                </button>
              )}
            </div>
            {publicWikiEnabled && (
              <input
                readOnly
                value={publicWikiUrl}
                className="w-full px-3 py-2 rounded-md text-sm"
                style={{ border: "1px solid var(--border)" }}
              />
            )}
          </section>

          {canManageWorkspace && (
            <section>
              <h4 className="font-medium text-sm mb-3">워크스페이스 멤버 초대</h4>
              <form onSubmit={handleInvite} className="flex gap-2 mb-4">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="이메일 주소"
                  required
                  className="flex-1 px-3 py-2 rounded-md text-sm"
                  style={{ border: "1px solid var(--border)" }}
                />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="px-2 py-2 rounded-md text-sm"
                  style={{ border: "1px solid var(--border)" }}
                >
                  <option value="editor">편집자</option>
                  <option value="viewer">뷰어</option>
                  <option value="admin">관리자</option>
                </select>
                <button
                  type="submit"
                  className="px-3 py-2 rounded-md text-white text-sm"
                  style={{ background: "var(--primary)" }}
                >
                  초대
                </button>
              </form>
            </section>
          )}

          {error && (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}

          <section>
            <h4 className="font-medium text-sm mb-3">멤버</h4>
            <div className="space-y-2">
              {members.map((member) => {
                const scimControlled = Boolean(
                  member.managedByScim || member.hasScimProvisionedAccess
                );

                return (
                  <div key={member.id} className="flex items-center justify-between py-2">
                    <div>
                      <div className="text-sm font-medium flex items-center gap-2">
                        <span>{member.user.name}</span>
                        {scimControlled && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded"
                            style={{ background: "rgba(59,130,246,0.1)", color: "var(--primary)" }}
                          >
                            SCIM
                          </span>
                        )}
                      </div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        {member.user.email}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs px-2 py-1 rounded"
                        style={{ background: "var(--sidebar-hover)" }}
                      >
                        {member.role === "owner"
                          ? "소유자"
                          : member.role === "admin"
                            ? "관리자"
                            : member.role === "editor"
                              ? "편집자"
                              : "뷰어"}
                      </span>
                      {scimControlled ? (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{ background: "rgba(59,130,246,0.1)", color: "var(--primary)" }}
                        >
                          IdP 관리
                        </span>
                      ) : canManageWorkspace && member.role !== "owner" && (
                        <button
                          onClick={() => handleRemove(member.user.id)}
                          className="text-xs hover:underline"
                          style={{ color: "var(--danger)" }}
                        >
                          제거
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
