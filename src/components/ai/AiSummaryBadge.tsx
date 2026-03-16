"use client";

import { useState } from "react";
import { Sparkles, RefreshCw, Loader2, ChevronDown } from "lucide-react";

interface AiSummaryBadgeProps {
  pageId: string;
  summary: string | null;
  onUpdate: (summary: string) => void;
}

export function AiSummaryBadge({ pageId, summary, onUpdate }: AiSummaryBadgeProps) {
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateSummary() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "요약 생성에 실패했습니다");
      }
      const data = await res.json();
      const text = data.summary || "";
      onUpdate(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="mx-4 md:mx-8 lg:mx-16 mt-2 mb-1 rounded-lg px-3 py-2 text-sm"
      style={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-2">
        <Sparkles size={14} style={{ color: "var(--primary)" }} />
        <span className="text-xs font-medium" style={{ color: "var(--muted)" }}>
          AI 요약
        </span>

        {summary ? (
          <>
            <button
              onClick={() => setExpanded(!expanded)}
              className="ml-auto p-0.5 rounded hover:opacity-70"
              style={{ color: "var(--muted)" }}
            >
              <ChevronDown
                size={14}
                style={{
                  transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s",
                }}
              />
            </button>
            <button
              onClick={generateSummary}
              disabled={loading}
              className="p-0.5 rounded hover:opacity-70 disabled:opacity-50"
              style={{ color: "var(--muted)" }}
              title="요약 다시 생성"
            >
              {loading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
            </button>
          </>
        ) : (
          <button
            onClick={generateSummary}
            disabled={loading}
            className="ml-auto flex items-center gap-1 text-xs px-2 py-1 rounded hover:opacity-70 disabled:opacity-50"
            style={{ color: "var(--primary)" }}
          >
            {loading ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                생성 중...
              </>
            ) : (
              "AI 요약 생성"
            )}
          </button>
        )}
      </div>

      {summary && expanded && (
        <p className="mt-2 text-sm whitespace-pre-wrap" style={{ color: "var(--muted)" }}>
          {summary}
        </p>
      )}

      {error && (
        <p className="mt-1 text-xs" style={{ color: "#ef4444" }}>
          {error}
        </p>
      )}
    </div>
  );
}
