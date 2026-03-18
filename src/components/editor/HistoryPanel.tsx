"use client";

import { useEffect, useState, useRef } from "react";
import { Clock, X, GitCompare } from "lucide-react";

interface HistoryEntry {
  oid: string;
  message: string;
  author: string;
  timestamp: number;
}

interface DiffLine {
  type: "add" | "remove" | "same";
  line: string;
}

function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  const result: DiffLine[] = [];

  let oi = 0, ni = 0;
  while (oi < oldLines.length || ni < newLines.length) {
    if (oi < oldLines.length && ni < newLines.length && oldLines[oi] === newLines[ni]) {
      result.push({ type: "same", line: oldLines[oi] });
      oi++; ni++;
    } else if (ni < newLines.length && (oi >= oldLines.length || !oldLines.includes(newLines[ni]))) {
      result.push({ type: "add", line: newLines[ni] });
      ni++;
    } else {
      result.push({ type: "remove", line: oldLines[oi] });
      oi++;
    }
  }
  return result;
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
  const [isVisible, setIsVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Compare mode state
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelections, setCompareSelections] = useState<[string | null, string | null]>([null, null]);
  const [diffResult, setDiffResult] = useState<DiffLine[] | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

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

  function toggleCompareSelection(oid: string) {
    setCompareSelections((prev) => {
      if (prev[0] === oid) return [null, prev[1]];
      if (prev[1] === oid) return [prev[0], null];
      if (!prev[0]) return [oid, prev[1]];
      if (!prev[1]) return [prev[0], oid];
      // Both filled, replace the second
      return [prev[0], oid];
    });
  }

  async function runCompare() {
    const [oidA, oidB] = compareSelections;
    if (!oidA || !oidB) return;

    setDiffLoading(true);
    setDiffResult(null);
    try {
      const [resA, resB] = await Promise.all([
        fetch(`/api/pages/${pageId}/history?oid=${oidA}`),
        fetch(`/api/pages/${pageId}/history?oid=${oidB}`),
      ]);
      if (resA.ok && resB.ok) {
        const dataA = await resA.json();
        const dataB = await resB.json();
        // Older version (A) vs newer version (B)
        const idxA = history.findIndex((h) => h.oid === oidA);
        const idxB = history.findIndex((h) => h.oid === oidB);
        // Higher index = older (list is newest first)
        const oldContent = idxA > idxB ? dataA.content : dataB.content;
        const newContent = idxA > idxB ? dataB.content : dataA.content;
        setDiffResult(computeLineDiff(oldContent as string, newContent as string));
      }
    } catch {
      // ignore fetch errors
    } finally {
      setDiffLoading(false);
    }
  }

  function exitCompareMode() {
    setCompareMode(false);
    setCompareSelections([null, null]);
    setDiffResult(null);
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="히스토리"
      aria-modal="true"
      className="fixed right-0 top-0 h-full w-full md:w-80 shadow-lg z-50 flex flex-col"
      style={{
        background: "var(--background)",
        borderLeft: "1px solid var(--border)",
        transform: isVisible ? "translateX(0)" : "translateX(100%)",
        transition: "transform 0.2s ease-out",
      }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div className="flex items-center justify-between p-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <h3 className="font-semibold text-sm">히스토리</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => compareMode ? exitCompareMode() : setCompareMode(true)}
            className="p-1 rounded hover:opacity-70 flex items-center gap-1 text-xs"
            style={{
              color: compareMode ? "var(--primary)" : "var(--foreground)",
              background: compareMode ? "var(--sidebar-hover)" : "transparent",
              border: "1px solid var(--border)",
              padding: "2px 8px",
              borderRadius: 4,
            }}
            title="버전 비교"
          >
            <GitCompare size={14} />
            비교
          </button>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70">
            <X size={16} />
          </button>
        </div>
      </div>

      {compareMode && (
        <div className="p-2 text-xs" style={{ borderBottom: "1px solid var(--border)", background: "var(--sidebar-bg)" }}>
          <p style={{ color: "var(--muted)", marginBottom: 4 }}>
            비교할 두 버전을 선택하세요
          </p>
          <button
            onClick={runCompare}
            disabled={!compareSelections[0] || !compareSelections[1] || diffLoading}
            className="w-full py-1.5 rounded text-white text-xs disabled:opacity-40"
            style={{ background: "var(--primary)" }}
          >
            {diffLoading ? "비교 중..." : "선택한 버전 비교"}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {history.map((entry) => (
          <div
            key={entry.oid}
            className="w-full text-left p-3 text-sm flex items-start gap-2"
            style={{
              borderBottom: "1px solid var(--border)",
              background: (!compareMode && selectedOid === entry.oid) ? "var(--sidebar-hover)" : undefined,
            }}
          >
            {compareMode && (
              <input
                type="checkbox"
                checked={compareSelections[0] === entry.oid || compareSelections[1] === entry.oid}
                onChange={() => toggleCompareSelection(entry.oid)}
                style={{ marginTop: 2, accentColor: "var(--primary)", flexShrink: 0 }}
              />
            )}
            <button
              onClick={() => !compareMode && viewVersion(entry.oid)}
              className="flex-1 text-left"
              style={{ background: "none", border: "none", padding: 0, cursor: compareMode ? "default" : "pointer" }}
            >
              <div className="font-medium">{entry.message}</div>
              <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                {entry.author} · {new Date(entry.timestamp).toLocaleString("ko")}
              </div>
            </button>
          </div>
        ))}
        {history.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2" style={{ color: "var(--muted)" }}>
            <Clock size={32} strokeWidth={1.5} />
            <p className="text-sm">아직 저장된 버전이 없습니다</p>
          </div>
        )}
      </div>

      {/* Diff dialog */}
      {compareMode && diffResult && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setDiffResult(null); }}
          onKeyDown={(e) => { if (e.key === "Escape") setDiffResult(null); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="버전 비교 결과"
            className="rounded-xl shadow-2xl flex flex-col"
            style={{
              background: "var(--background)",
              border: "1px solid var(--border)",
              width: "min(90vw, 720px)",
              maxHeight: "80vh",
            }}
          >
            <div
              className="flex items-center justify-between px-4 py-3 shrink-0"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <div className="flex items-center gap-2">
                <GitCompare size={16} style={{ color: "var(--primary)" }} />
                <span className="font-semibold text-sm">버전 비교 결과</span>
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "var(--sidebar-bg)", color: "var(--muted)" }}>
                  +{diffResult.filter((l) => l.type === "add").length}
                  {" "}-{diffResult.filter((l) => l.type === "remove").length}
                </span>
              </div>
              <button
                onClick={() => setDiffResult(null)}
                className="p-1 rounded hover:opacity-70"
                aria-label="닫기"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <pre
                className="text-sm p-3 rounded overflow-auto font-mono"
                style={{ background: "var(--sidebar-bg)", margin: 0 }}
              >
                {diffResult.map((line, i) => (
                  <div
                    key={i}
                    style={{
                      background:
                        line.type === "add"
                          ? "rgba(34, 197, 94, 0.12)"
                          : line.type === "remove"
                            ? "rgba(239, 68, 68, 0.12)"
                            : "transparent",
                      color:
                        line.type === "add"
                          ? "#22c55e"
                          : line.type === "remove"
                            ? "#ef4444"
                            : "var(--foreground)",
                      padding: "2px 8px",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      lineHeight: 1.6,
                    }}
                  >
                    {line.type === "add" ? "+ " : line.type === "remove" ? "- " : "  "}
                    {line.line}
                  </div>
                ))}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Single version preview */}
      {!compareMode && preview && (
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
