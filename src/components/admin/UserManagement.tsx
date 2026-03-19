"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Search,
  Trash2,
  Shield,
  ShieldOff,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";

interface UserEntry {
  id: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  _count: { memberships: number };
}

const PAGE_SIZE = 20;

export function UserManagement() {
  const router = useRouter();
  const [users, setUsers] = useState<UserEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<UserEntry | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (query) params.set("q", query);
      const res = await fetch(`/api/admin/users?${params}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
        setTotal(data.total);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [query, offset]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  function handleSearch() {
    setQuery(searchInput);
    setOffset(0);
  }

  async function handleDelete(user: UserEntry) {
    setActionLoading(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      if (res.ok) {
        setToast(`"${user.name}" 사용자가 삭제되었습니다`);
        setConfirmDelete(null);
        fetchUsers();
      } else {
        const data = await res.json();
        setToast(`삭제 실패: ${data.error}`);
      }
    } catch {
      setToast("삭제 중 오류가 발생했습니다");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleToggleAdmin(user: UserEntry) {
    setActionLoading(user.id);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPlatformAdmin: !user.isPlatformAdmin }),
      });
      if (res.ok) {
        setToast(
          user.isPlatformAdmin
            ? `"${user.name}" 관리자 권한이 해제되었습니다`
            : `"${user.name}" 관리자로 지정되었습니다`
        );
        fetchUsers();
      } else {
        const data = await res.json();
        setToast(`변경 실패: ${data.error}`);
      }
    } catch {
      setToast("변경 중 오류가 발생했습니다");
    } finally {
      setActionLoading(null);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/admin/ops")}
          className="p-1.5 rounded hover:opacity-70"
          title="관리자 대시보드"
        >
          <ArrowLeft size={18} />
        </button>
        <Users size={24} style={{ color: "var(--primary)" }} />
        <div>
          <h1 className="text-xl font-bold">사용자 관리</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            전체 {total}명의 사용자
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-4">
        <div className="flex-1 relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--muted)" }}
          />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            placeholder="이름 또는 이메일로 검색..."
            className="w-full pl-9 pr-3 py-2 rounded-lg text-sm bg-transparent outline-none"
            style={{ border: "1px solid var(--border)" }}
          />
        </div>
        <button
          onClick={handleSearch}
          className="px-4 py-2 rounded-lg text-sm text-white"
          style={{ background: "var(--primary)" }}
        >
          검색
        </button>
      </div>

      {/* User table */}
      <div
        className="rounded-lg overflow-hidden"
        style={{ border: "1px solid var(--border)" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--sidebar-bg)", borderBottom: "1px solid var(--border)" }}>
              <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--muted)" }}>사용자</th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell" style={{ color: "var(--muted)" }}>워크스페이스</th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell" style={{ color: "var(--muted)" }}>최근 로그인</th>
              <th className="text-left px-4 py-3 font-medium hidden sm:table-cell" style={{ color: "var(--muted)" }}>가입일</th>
              <th className="text-right px-4 py-3 font-medium" style={{ color: "var(--muted)" }}>작업</th>
            </tr>
          </thead>
          <tbody>
            {loading && users.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12" style={{ color: "var(--muted)" }}>
                  로딩 중...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12" style={{ color: "var(--muted)" }}>
                  사용자가 없습니다
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr
                  key={user.id}
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium">{user.name}</span>
                          {user.isPlatformAdmin && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                              style={{ background: "var(--primary)", color: "white" }}
                            >
                              관리자
                            </span>
                          )}
                        </div>
                        <div className="text-xs" style={{ color: "var(--muted)" }}>
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell" style={{ color: "var(--muted)" }}>
                    {user._count.memberships}개
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell" style={{ color: "var(--muted)" }}>
                    {user.lastLoginAt
                      ? new Date(user.lastLoginAt).toLocaleDateString("ko")
                      : "-"}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell" style={{ color: "var(--muted)" }}>
                    {new Date(user.createdAt).toLocaleDateString("ko")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleToggleAdmin(user)}
                        disabled={actionLoading === user.id}
                        className="p-1.5 rounded hover:opacity-70 disabled:opacity-40"
                        title={user.isPlatformAdmin ? "관리자 해제" : "관리자 지정"}
                      >
                        {user.isPlatformAdmin ? (
                          <ShieldOff size={14} style={{ color: "var(--muted)" }} />
                        ) : (
                          <Shield size={14} style={{ color: "var(--muted)" }} />
                        )}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(user)}
                        disabled={user.isPlatformAdmin || actionLoading === user.id}
                        className="p-1.5 rounded hover:opacity-70 disabled:opacity-40"
                        title="사용자 삭제"
                      >
                        <Trash2 size={14} style={{ color: user.isPlatformAdmin ? "var(--muted)" : "#ef4444" }} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} / {total}명
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              className="p-1.5 rounded hover:opacity-70 disabled:opacity-40"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm px-2" style={{ color: "var(--muted)" }}>
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={currentPage >= totalPages}
              className="p-1.5 rounded hover:opacity-70 disabled:opacity-40"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="rounded-xl shadow-2xl p-6"
            style={{
              background: "var(--background)",
              border: "1px solid var(--border)",
              width: "min(90vw, 400px)",
            }}
          >
            <h3 className="font-semibold text-base mb-2">사용자 삭제</h3>
            <p className="text-sm mb-1">
              <strong>{confirmDelete.name}</strong> ({confirmDelete.email})
            </p>
            <p className="text-sm mb-4" style={{ color: "#ef4444" }}>
              이 사용자의 모든 데이터(워크스페이스 멤버십, 댓글, 첨부파일 등)가 영구적으로 삭제됩니다.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ border: "1px solid var(--border)" }}
              >
                취소
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={actionLoading === confirmDelete.id}
                className="px-4 py-2 rounded-lg text-sm text-white disabled:opacity-50"
                style={{ background: "#ef4444" }}
              >
                {actionLoading === confirmDelete.id ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-4 right-4 z-[100] px-4 py-2.5 rounded-lg shadow-lg text-sm"
          style={{ background: "var(--foreground)", color: "var(--background)" }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
