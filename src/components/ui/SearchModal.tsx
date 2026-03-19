"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, FileText, Loader2 } from "lucide-react";

interface SearchResult {
  id: string;
  title: string;
  slug: string;
  icon: string | null;
  snippet: string | null;
  matchType?: "recent" | "title" | "content" | "semantic";
}

interface SearchModalProps {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
}

function highlightKeyword(text: string, keyword: string): React.ReactNode {
  if (!keyword.trim()) return text;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  if (parts.length === 1) return text;
  const testRegex = new RegExp(`^${escaped}$`, "i");
  return parts.map((part, i) =>
    testRegex.test(part) ? (
      <mark
        key={i}
        style={{
          background: "var(--primary-highlight, rgba(var(--primary-rgb, 59,130,246), 0.2))",
          color: "inherit",
          borderRadius: 2,
          padding: "0 1px",
        }}
      >
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function SearchModal({ workspaceId, isOpen, onClose }: SearchModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const getMatchTypeLabel = (matchType: SearchResult["matchType"]) => {
    switch (matchType) {
      case "title":
        return "제목";
      case "content":
        return "본문";
      case "semantic":
        return "의미";
      case "recent":
        return "최근";
      default:
        return null;
    }
  };

  // 검색 실행 (디바운스)
  const doSearch = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const res = await fetch(
            `/api/pages/search?workspaceId=${workspaceId}&q=${encodeURIComponent(q)}`
          );
          if (res.ok) {
            const data = await res.json();
            setResults(Array.isArray(data) ? data : data.results ?? []);
            setSelectedIndex(0);
          }
        } catch (_error) {
          // ignore
        } finally {
          setLoading(false);
        }
      }, 300);
    },
    [workspaceId]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
      doSearch("");
    }
  }, [isOpen, doSearch]);

  // 키보드 선택 시 해당 항목이 보이도록 스크롤
  useEffect(() => {
    const el = document.querySelector(`[data-search-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      navigateTo(results[selectedIndex]);
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  function navigateTo(result: SearchResult) {
    router.push(`/workspace/${workspaceId}/page/${result.id}`);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[20vh]"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="페이지 검색"
        className="w-full max-w-lg rounded-lg shadow-2xl overflow-hidden"
        style={{ background: "var(--background)", border: "1px solid var(--border)" }}
      >
        {/* 검색 입력 */}
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <Search size={18} style={{ color: "var(--muted)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              doSearch(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder="페이지 검색..."
            className="flex-1 bg-transparent outline-none text-sm"
          />
          <kbd
            className="text-xs px-1.5 py-0.5 rounded"
            style={{ background: "var(--sidebar-hover)", color: "var(--muted)" }}
          >
            ESC
          </kbd>
        </div>

        {/* 검색 결과 */}
        <div className="max-h-80 overflow-auto">
          {loading && (
            <div className="flex items-center gap-2 px-4 py-3 text-sm" style={{ color: "var(--muted)" }}>
              <Loader2 size={14} className="animate-spin" />
              검색 중...
            </div>
          )}
          {!loading && query && results.length === 0 && (
            <div className="px-4 py-3 text-sm" style={{ color: "var(--muted)" }}>
              검색 결과가 없습니다
            </div>
          )}
          {results.map((result, i) => (
            <button
              key={result.id}
              data-search-index={i}
              onClick={() => navigateTo(result)}
              className="w-full flex items-start gap-3 px-4 py-3 text-sm text-left"
              style={{
                background: i === selectedIndex ? "var(--sidebar-hover)" : undefined,
              }}
              onMouseEnter={() => setSelectedIndex(i)}
            >
              <FileText size={16} style={{ color: "var(--muted)" }} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate font-medium">
                    {result.icon ? `${result.icon} ` : ""}
                    {highlightKeyword(result.title || "제목 없음", query)}
                  </span>
                  {getMatchTypeLabel(result.matchType) && (
                    <span
                      className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium"
                      style={{
                        background:
                          result.matchType === "semantic"
                            ? "rgba(59,130,246,0.12)"
                            : "var(--sidebar-bg)",
                        color:
                          result.matchType === "semantic"
                            ? "var(--primary)"
                            : "var(--muted)",
                      }}
                    >
                      {getMatchTypeLabel(result.matchType)}
                    </span>
                  )}
                </div>
                <div className="text-xs truncate mt-0.5" style={{ color: "var(--muted)" }}>
                  {result.slug}
                </div>
                {result.snippet && (
                  <p
                    className="text-xs mt-1 line-clamp-2"
                    style={{
                      color: "var(--muted)",
                      ...(result.matchType === "semantic"
                        ? {
                            background: "rgba(59,130,246,0.06)",
                            borderRadius: 3,
                            padding: "2px 4px",
                          }
                        : {}),
                    }}
                  >
                    {highlightKeyword(result.snippet, query)}
                  </p>
                )}
              </div>
            </button>
          ))}
          {!loading && !query && results.length === 0 && (
            <div className="px-4 py-3 text-sm" style={{ color: "var(--muted)" }}>
              최근 문서를 불러오지 못했습니다
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
