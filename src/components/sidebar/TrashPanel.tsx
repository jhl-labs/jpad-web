"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Trash2, RotateCcw, AlertTriangle } from "lucide-react";

interface DeletedPage {
  id: string;
  title: string;
  icon: string | null;
  deletedAt: string;
}

function relativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return date.toLocaleDateString("ko");
}

export function TrashPanel({
  workspaceId,
  onClose,
  onRestore,
}: {
  workspaceId: string;
  onClose: () => void;
  onRestore: () => void;
}) {
  const [pages, setPages] = useState<DeletedPage[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrash = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/trash?workspaceId=${workspaceId}`);
      if (res.ok) {
        const data = await res.json();
        setPages(data);
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchTrash();
  }, [fetchTrash]);

  async function handleRestore(pageId: string) {
    const res = await fetch(`/api/trash/${pageId}`, { method: "PATCH" });
    if (res.ok) {
      setPages((prev) => prev.filter((p) => p.id !== pageId));
      onRestore();
    }
  }

  async function handlePermanentDelete(pageId: string) {
    if (!confirm("이 페이지를 영구적으로 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
      return;
    }
    const res = await fetch(`/api/trash/${pageId}`, { method: "DELETE" });
    if (res.ok) {
      setPages((prev) => prev.filter((p) => p.id !== pageId));
      onRestore();
    }
  }

  return (
    <div
      role="dialog"
      aria-label="휴지통"
      aria-modal="true"
      className="fixed right-0 top-0 h-full w-80 shadow-lg z-50 flex flex-col"
      style={{ background: "var(--background)", borderLeft: "1px solid var(--border)" }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <Trash2 size={16} />
          <h3 className="font-semibold text-sm">휴지통</h3>
          {pages.length > 0 && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full"
              style={{ background: "var(--sidebar-hover)", color: "var(--muted)" }}
            >
              {pages.length}
            </span>
          )}
        </div>
        <button onClick={onClose} className="p-1 rounded hover:opacity-70">
          <X size={16} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-3 space-y-2">
        {loading && (
          <p className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
            불러오는 중...
          </p>
        )}

        {!loading && pages.length === 0 && (
          <p className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
            휴지통이 비어있습니다
          </p>
        )}

        {pages.map((page) => (
          <div
            key={page.id}
            className="p-3 rounded-lg"
            style={{ background: "var(--sidebar-bg)" }}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {page.icon ? `${page.icon} ` : ""}
                  {page.title}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                  {page.deletedAt ? relativeTime(new Date(page.deletedAt)) : ""}에 삭제됨
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => handleRestore(page.id)}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:opacity-70"
                style={{
                  color: "var(--primary)",
                  border: "1px solid var(--border)",
                }}
              >
                <RotateCcw size={12} /> 복원
              </button>
              <button
                onClick={() => handlePermanentDelete(page.id)}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded hover:opacity-70"
                style={{
                  color: "#ef4444",
                  border: "1px solid var(--border)",
                }}
              >
                <AlertTriangle size={12} /> 영구 삭제
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
