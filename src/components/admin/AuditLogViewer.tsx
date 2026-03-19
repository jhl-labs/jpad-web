"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  X,
} from "lucide-react";

interface AuditLogEntry {
  id: string;
  action: string;
  status: string;
  requestId: string | null;
  actorId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  workspaceId: string | null;
  pageId: string | null;
  targetId: string | null;
  targetType: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const PAGE_SIZE = 50;

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
  success: { label: "성공", color: "#22c55e", bg: "rgba(34,197,94,0.1)" },
  denied: { label: "거부", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  error: { label: "에러", color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
};

export function AuditLogViewer() {
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (query) params.set("q", query);
      if (statusFilter) params.set("status", statusFilter);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);

      const res = await fetch(`/api/admin/audit-logs?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotal(data.total);
      } else {
        setToast("감사 로그를 불러오지 못했습니다");
      }
    } catch {
      setToast("감사 로그를 불러오는 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  }, [query, statusFilter, fromDate, toDate, offset]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  function handleSearch() {
    setQuery(searchInput);
    setOffset(0);
  }

  function handleStatusChange(value: string) {
    setStatusFilter(value);
    setOffset(0);
  }

  function handleFromChange(value: string) {
    setFromDate(value);
    setOffset(0);
  }

  function handleToChange(value: string) {
    setToDate(value);
    setOffset(0);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/admin/ops")}
          className="p-1.5 rounded hover:opacity-70"
          title="관리자 대시보드"
        >
          <ArrowLeft size={18} />
        </button>
        <Shield size={24} style={{ color: "var(--primary)" }} />
        <div>
          <h1 className="text-xl font-bold">감사 로그</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            전체 {total}건
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* Search */}
        <div className="flex-1 min-w-[200px] relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--muted)" }}
          />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            placeholder="이름/이메일/액션 검색..."
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

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => handleStatusChange(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
          style={{ border: "1px solid var(--border)", color: "var(--foreground)" }}
        >
          <option value="">전체 상태</option>
          <option value="success">성공</option>
          <option value="denied">거부</option>
          <option value="error">에러</option>
        </select>

        {/* Date range */}
        <input
          type="date"
          value={fromDate}
          onChange={(e) => handleFromChange(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
          style={{ border: "1px solid var(--border)", color: "var(--foreground)" }}
          title="시작 날짜"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => handleToChange(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm bg-transparent outline-none"
          style={{ border: "1px solid var(--border)", color: "var(--foreground)" }}
          title="종료 날짜"
        />
      </div>

      {/* Table */}
      <div
        className="rounded-lg overflow-hidden"
        style={{ border: "1px solid var(--border)" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr
              style={{
                background: "var(--sidebar-bg)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--muted)" }}>
                시간
              </th>
              <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--muted)" }}>
                액션
              </th>
              <th className="text-left px-4 py-3 font-medium" style={{ color: "var(--muted)" }}>
                상태
              </th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell" style={{ color: "var(--muted)" }}>
                사용자
              </th>
              <th className="text-left px-4 py-3 font-medium hidden lg:table-cell" style={{ color: "var(--muted)" }}>
                대상
              </th>
              <th className="text-left px-4 py-3 font-medium hidden lg:table-cell" style={{ color: "var(--muted)" }}>
                IP
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12" style={{ color: "var(--muted)" }}>
                  로딩 중...
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12" style={{ color: "var(--muted)" }}>
                  감사 로그가 없습니다
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const badge = STATUS_BADGE[log.status] || STATUS_BADGE.success;
                return (
                  <tr
                    key={log.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(log)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") setSelected(log);
                    }}
                    className="cursor-pointer"
                    style={{ borderBottom: "1px solid var(--border)" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "var(--sidebar-hover)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.background = "";
                    }}
                  >
                    <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--muted)" }}>
                      {new Date(log.createdAt).toLocaleString("ko")}
                    </td>
                    <td className="px-4 py-3">
                      <code
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ background: "var(--sidebar-bg)" }}
                      >
                        {log.action}
                      </code>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ color: badge.color, background: badge.bg }}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div>
                        <span className="font-medium">{log.actorName || "-"}</span>
                        {log.actorEmail && (
                          <div className="text-xs" style={{ color: "var(--muted)" }}>
                            {log.actorEmail}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell" style={{ color: "var(--muted)" }}>
                      {log.targetType ? `${log.targetType}` : "-"}
                      {log.targetId && (
                        <div className="text-xs truncate max-w-[120px]" title={log.targetId}>
                          {log.targetId}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell" style={{ color: "var(--muted)" }}>
                      {log.ipAddress || "-"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} / {total}건
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

      {/* Detail dialog */}
      {selected && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="rounded-xl shadow-2xl p-6 overflow-auto"
            style={{
              background: "var(--background)",
              border: "1px solid var(--border)",
              width: "min(90vw, 600px)",
              maxHeight: "80vh",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-base">감사 로그 상세</h3>
              <button
                onClick={() => setSelected(null)}
                className="p-1 rounded hover:opacity-70"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <DetailRow label="ID" value={selected.id} />
              <DetailRow label="액션" value={selected.action} />
              <DetailRow
                label="상태"
                value={STATUS_BADGE[selected.status]?.label || selected.status}
              />
              <DetailRow label="요청 ID" value={selected.requestId} />
              <DetailRow
                label="시간"
                value={new Date(selected.createdAt).toLocaleString("ko")}
              />
              <DetailRow label="사용자 ID" value={selected.actorId} />
              <DetailRow label="사용자 이름" value={selected.actorName} />
              <DetailRow label="사용자 이메일" value={selected.actorEmail} />
              <DetailRow label="사용자 역할" value={selected.actorRole} />
              <DetailRow label="워크스페이스 ID" value={selected.workspaceId} />
              <DetailRow label="페이지 ID" value={selected.pageId} />
              <DetailRow label="대상 ID" value={selected.targetId} />
              <DetailRow label="대상 타입" value={selected.targetType} />
              <DetailRow label="IP 주소" value={selected.ipAddress} />
              <DetailRow label="User Agent" value={selected.userAgent} />

              {selected.metadata && (
                <div>
                  <span className="font-medium" style={{ color: "var(--muted)" }}>
                    Metadata
                  </span>
                  <pre
                    className="mt-1 p-3 rounded-lg text-xs overflow-auto"
                    style={{
                      background: "var(--sidebar-bg)",
                      border: "1px solid var(--border)",
                      maxHeight: "200px",
                    }}
                  >
                    {JSON.stringify(selected.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setSelected(null)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ border: "1px solid var(--border)" }}
              >
                닫기
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

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-3">
      <span className="font-medium shrink-0 w-28" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <span className="break-all">{value || "-"}</span>
    </div>
  );
}
