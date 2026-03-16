"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  FileText,
  Plus,
  Calendar,
  CheckSquare,
  Settings,
  Loader2,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  title: string;
  slug: string;
  icon: string | null;
  snippet: string | null;
  matchType?: "recent" | "title" | "content" | "semantic";
}

interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  action: () => void;
  keywords: string[];
}

type ListItem =
  | { type: "page"; data: SearchResult }
  | { type: "action"; data: QuickAction };

interface QuickSwitcherProps {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
}

// ── Recent pages (localStorage) ──────────────────────────────

const RECENT_KEY = "jpad:recent-pages";
const MAX_RECENT = 5;

function getRecentPages(workspaceId: string): SearchResult[] {
  try {
    const raw = localStorage.getItem(`${RECENT_KEY}:${workspaceId}`);
    if (!raw) return [];
    return JSON.parse(raw) as SearchResult[];
  } catch {
    return [];
  }
}

export function trackRecentPage(workspaceId: string, page: { id: string; title: string; slug: string; icon: string | null }) {
  try {
    const existing = getRecentPages(workspaceId);
    const filtered = existing.filter((p) => p.id !== page.id);
    const entry: SearchResult = { ...page, snippet: null, matchType: "recent" };
    const updated = [entry, ...filtered].slice(0, MAX_RECENT);
    localStorage.setItem(`${RECENT_KEY}:${workspaceId}`, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

// ── Match type label ─────────────────────────────────────────

function getMatchTypeLabel(matchType: SearchResult["matchType"]) {
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
}

// ── Highlight matching text ──────────────────────────────────

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? <mark key={i} style={{ background: "rgba(59,130,246,0.2)", padding: "0 2px", borderRadius: 2 }}>{part}</mark> : part
  );
}

// ── Component ────────────────────────────────────────────────

export function QuickSwitcher({ workspaceId, isOpen, onClose }: QuickSwitcherProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const listRef = useRef<HTMLDivElement>(null);

  // ── Quick actions ────────────────────────────────────────

  const quickActions: QuickAction[] = [
    {
      id: "new-page",
      label: "새 페이지 만들기",
      description: query ? `"${query}" 제목으로 생성` : "빈 페이지 생성",
      icon: <Plus size={16} />,
      action: async () => {
        const res = await fetch("/api/pages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, title: query || undefined }),
        });
        if (res.ok) {
          const page = await res.json();
          window.dispatchEvent(new Event("sidebar:refresh"));
          router.push(`/workspace/${workspaceId}/page/${page.id}`);
        }
        onClose();
      },
      keywords: ["새", "페이지", "만들기", "생성", "new", "page", "create"],
    },
    {
      id: "open-calendar",
      label: "캘린더 열기",
      description: "캘린더 페이지로 이동",
      icon: <Calendar size={16} />,
      action: () => {
        router.push(`/workspace/${workspaceId}/calendar`);
        onClose();
      },
      keywords: ["캘린더", "달력", "calendar"],
    },
    {
      id: "open-todos",
      label: "할 일 열기",
      description: "할 일 관리 페이지로 이동",
      icon: <CheckSquare size={16} />,
      action: () => {
        router.push(`/workspace/${workspaceId}/todos`);
        onClose();
      },
      keywords: ["할 일", "할일", "todo", "todos", "task"],
    },
    {
      id: "open-settings",
      label: "설정 열기",
      description: "워크스페이스 설정으로 이동",
      icon: <Settings size={16} />,
      action: () => {
        router.push(`/workspace/${workspaceId}/settings`);
        onClose();
      },
      keywords: ["설정", "세팅", "settings", "config"],
    },
  ];

  // Filter quick actions based on query
  const filteredActions = query
    ? quickActions.filter(
        (a) =>
          a.label.toLowerCase().includes(query.toLowerCase()) ||
          a.keywords.some((k) => k.toLowerCase().includes(query.toLowerCase()))
      )
    : quickActions;

  // ── Build list items ─────────────────────────────────────

  const recentPages = !query ? getRecentPages(workspaceId) : [];
  const listItems: ListItem[] = [
    ...results.map((r): ListItem => ({ type: "page", data: r })),
    ...(!query && results.length === 0
      ? recentPages.map((r): ListItem => ({ type: "page", data: r }))
      : []),
    ...filteredActions.map((a): ListItem => ({ type: "action", data: a })),
  ];

  // ── Search ───────────────────────────────────────────────

  const doSearch = useCallback(
    (q: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!q.trim()) {
        setResults([]);
        setSelectedIndex(0);
        return;
      }
      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const res = await fetch(
            `/api/pages/search?workspaceId=${workspaceId}&q=${encodeURIComponent(q)}`
          );
          if (res.ok) {
            const data = await res.json();
            setResults(data);
            setSelectedIndex(0);
          }
        } catch {
          // ignore
        } finally {
          setLoading(false);
        }
      }, 300);
    },
    [workspaceId]
  );

  // ── Open / close ─────────────────────────────────────────

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // ── Keyboard navigation ──────────────────────────────────

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, listItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      executeItem(selectedIndex);
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  // Scroll selected item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // ── Execute ──────────────────────────────────────────────

  function executeItem(index: number) {
    const item = listItems[index];
    if (!item) return;
    if (item.type === "page") {
      trackRecentPage(workspaceId, item.data);
      router.push(`/workspace/${workspaceId}/page/${item.data.id}`);
      onClose();
    } else {
      item.data.action();
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh]"
      style={{ background: "rgba(0,0,0,0.4)", backdropFilter: "blur(4px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-[640px] rounded-xl shadow-2xl overflow-hidden"
        style={{
          background: "var(--background)",
          border: "1px solid var(--border)",
        }}
      >
        {/* 검색 입력 */}
        <div
          className="flex items-center gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <Search size={20} style={{ color: "var(--muted)" }} className="shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              doSearch(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder="페이지 검색 또는 명령 입력..."
            className="flex-1 bg-transparent outline-none text-base"
            style={{ color: "var(--foreground)" }}
          />
          {loading && (
            <Loader2
              size={16}
              className="animate-spin shrink-0"
              style={{ color: "var(--muted)" }}
            />
          )}
        </div>

        {/* 결과 목록 */}
        <div ref={listRef} className="max-h-[400px] overflow-auto py-2">
          {/* 최근 페이지 섹션 */}
          {!query && recentPages.length > 0 && (
            <div className="px-4 pt-1 pb-1.5">
              <span
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted)" }}
              >
                최근 페이지
              </span>
            </div>
          )}

          {/* 검색 결과 섹션 헤더 */}
          {query && results.length > 0 && (
            <div className="px-4 pt-1 pb-1.5">
              <span
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted)" }}
              >
                페이지
              </span>
            </div>
          )}

          {/* 페이지 아이템 */}
          {(query ? results : recentPages).map((result, i) => {
            const globalIndex = i;
            return (
              <button
                key={result.id}
                data-index={globalIndex}
                onClick={() => executeItem(globalIndex)}
                onMouseEnter={() => setSelectedIndex(globalIndex)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors"
                style={{
                  background:
                    globalIndex === selectedIndex
                      ? "var(--sidebar-hover)"
                      : undefined,
                }}
              >
                {result.icon ? (
                  <span className="text-base shrink-0">{result.icon}</span>
                ) : (
                  <FileText
                    size={16}
                    style={{ color: "var(--muted)" }}
                    className="shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">
                      {query ? highlightText(result.title || "제목 없음", query) : (result.title || "제목 없음")}
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
                  {result.slug && (
                    <span
                      className="text-xs truncate block mt-0.5"
                      style={{ color: "var(--muted)" }}
                    >
                      {result.slug}
                    </span>
                  )}
                  {result.snippet && (
                    <p
                      className="text-xs mt-0.5 line-clamp-1"
                      style={{ color: "var(--muted)" }}
                    >
                      {query ? highlightText(result.snippet, query) : result.snippet}
                    </p>
                  )}
                </div>
                {globalIndex === selectedIndex && (
                  <CornerDownLeft
                    size={12}
                    className="shrink-0"
                    style={{ color: "var(--muted)" }}
                  />
                )}
              </button>
            );
          })}

          {/* 검색 중 로딩 (결과 없을 때) */}
          {loading && results.length === 0 && query && (
            <div
              className="flex items-center gap-2 px-4 py-3 text-sm"
              style={{ color: "var(--muted)" }}
            >
              <Loader2 size={14} className="animate-spin" />
              검색 중...
            </div>
          )}

          {/* 검색 결과 없음 */}
          {!loading && query && results.length === 0 && (
            <div
              className="px-4 py-3 text-sm"
              style={{ color: "var(--muted)" }}
            >
              &quot;{query}&quot;에 대한 검색 결과가 없습니다
            </div>
          )}

          {/* 빠른 동작 구분선 */}
          {((query && results.length > 0) || (!query && recentPages.length > 0)) &&
            filteredActions.length > 0 && (
              <div
                className="mx-4 my-2"
                style={{ borderTop: "1px solid var(--border)" }}
              />
            )}

          {/* 빠른 동작 섹션 */}
          {filteredActions.length > 0 && (
            <>
              <div className="px-4 pt-1 pb-1.5">
                <span
                  className="text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--muted)" }}
                >
                  빠른 동작
                </span>
              </div>
              {filteredActions.map((action, i) => {
                const globalIndex =
                  (query ? results.length : recentPages.length) + i;
                return (
                  <button
                    key={action.id}
                    data-index={globalIndex}
                    onClick={() => executeItem(globalIndex)}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-colors"
                    style={{
                      background:
                        globalIndex === selectedIndex
                          ? "var(--sidebar-hover)"
                          : undefined,
                    }}
                  >
                    <span
                      className="shrink-0"
                      style={{ color: "var(--primary)" }}
                    >
                      {action.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{action.label}</span>
                      <span
                        className="text-xs block mt-0.5"
                        style={{ color: "var(--muted)" }}
                      >
                        {action.description}
                      </span>
                    </div>
                    {globalIndex === selectedIndex && (
                      <CornerDownLeft
                        size={12}
                        className="shrink-0"
                        style={{ color: "var(--muted)" }}
                      />
                    )}
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* 하단 힌트 바 */}
        <div
          className="flex items-center gap-4 px-4 py-2.5 text-[11px]"
          style={{
            borderTop: "1px solid var(--border)",
            color: "var(--muted)",
          }}
        >
          <span className="flex items-center gap-1">
            <kbd
              className="inline-flex items-center justify-center w-5 h-5 rounded"
              style={{ background: "var(--sidebar-hover)" }}
            >
              <ArrowUp size={10} />
            </kbd>
            <kbd
              className="inline-flex items-center justify-center w-5 h-5 rounded"
              style={{ background: "var(--sidebar-hover)" }}
            >
              <ArrowDown size={10} />
            </kbd>
            이동
          </span>
          <span className="flex items-center gap-1">
            <kbd
              className="inline-flex items-center justify-center px-1.5 h-5 rounded text-[10px]"
              style={{ background: "var(--sidebar-hover)" }}
            >
              Enter
            </kbd>
            선택
          </span>
          <span className="flex items-center gap-1">
            <kbd
              className="inline-flex items-center justify-center px-1.5 h-5 rounded text-[10px]"
              style={{ background: "var(--sidebar-hover)" }}
            >
              Esc
            </kbd>
            닫기
          </span>
        </div>
      </div>
    </div>
  );
}
