"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface HistoryEntry {
  oid: string;
  message: string;
  author: string;
  timestamp: number;
}

export function HistoryPanel({
  pageId,
  onClose,
  onRestore,
}: {
  pageId: string;
  onClose: () => void;
  onRestore: (content: string) => void;
}) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [selectedOid, setSelectedOid] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pages/${pageId}/history`)
      .then((r) => r.json())
      .then(setHistory)
      .catch(() => {});
  }, [pageId]);

  async function viewVersion(oid: string) {
    setSelectedOid(oid);
    const res = await fetch(`/api/pages/${pageId}/history?oid=${oid}`);
    if (res.ok) {
      const data = await res.json();
      setPreview(data.content);
    }
  }

  return (
    <div
      role="dialog"
      aria-label="히스토리"
      aria-modal="true"
      className="fixed right-0 top-0 h-full w-full md:w-80 shadow-lg z-50 flex flex-col"
      style={{ background: "var(--background)", borderLeft: "1px solid var(--border)" }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div className="flex items-center justify-between p-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <h3 className="font-semibold text-sm">히스토리</h3>
        <button onClick={onClose} className="p-1 rounded hover:opacity-70">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {history.map((entry) => (
          <button
            key={entry.oid}
            onClick={() => viewVersion(entry.oid)}
            className="w-full text-left p-3 text-sm"
            style={{
              borderBottom: "1px solid var(--border)",
              background: selectedOid === entry.oid ? "var(--sidebar-hover)" : undefined,
            }}
          >
            <div className="font-medium">{entry.message}</div>
            <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              {entry.author} · {new Date(entry.timestamp).toLocaleString("ko")}
            </div>
          </button>
        ))}
        {history.length === 0 && (
          <p className="p-4 text-sm text-center" style={{ color: "var(--muted)" }}>
            히스토리가 없습니다
          </p>
        )}
      </div>

      {preview && (
        <div className="p-3" style={{ borderTop: "1px solid var(--border)" }}>
          <pre className="text-xs max-h-40 overflow-auto p-2 rounded mb-2" style={{ background: "var(--sidebar-bg)" }}>
            {preview}
          </pre>
          <button
            onClick={() => {
              if (confirm("현재 편집 중인 내용이 이 버전으로 대체됩니다. 계속하시겠습니까?")) {
                onRestore(preview);
                onClose();
              }
            }}
            className="w-full py-2 rounded text-white text-sm"
            style={{ background: "var(--primary)" }}
          >
            이 버전으로 복원
          </button>
        </div>
      )}
    </div>
  );
}
