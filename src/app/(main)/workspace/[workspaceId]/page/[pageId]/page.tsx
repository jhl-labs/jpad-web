"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { CursorContext } from "@/components/editor/CollaborativeEditor";
import { BacklinkPanel } from "@/components/editor/BacklinkPanel";
import { AttachmentPanel } from "@/components/editor/AttachmentPanel";
import { BacklinkSuggestion } from "@/components/editor/BacklinkSuggestion";
import { HistoryPanel } from "@/components/editor/HistoryPanel";
import { RelatedPagesPanel } from "@/components/editor/RelatedPagesPanel";
import { ShareDialog } from "@/components/workspace/ShareDialog";
import { CommentPanel } from "@/components/editor/CommentPanel";
import { AiPanel } from "@/components/ai/AiPanel";
import { AiSummaryBadge } from "@/components/ai/AiSummaryBadge";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { EmojiPicker } from "@/components/editor/EmojiPicker";
import { CoverPicker } from "@/components/editor/CoverPicker";
import { TableOfContents } from "@/components/editor/TableOfContents";
import {
  Clock,
  Download,
  FileText,
  ImageIcon,
  ListTree,
  MessageCircle,
  MoreHorizontal,
  Network,
  Share2,
  SmilePlus,
  Sparkles,
  Star,
  WandSparkles,
} from "lucide-react";
import { trackRecentPage } from "@/components/ui/QuickSwitcher";

const CollaborativeEditor = dynamic(
  () => import("@/components/editor/CollaborativeEditor").then((m) => m.CollaborativeEditor),
  { ssr: false }
);

interface PageData {
  id: string;
  title: string;
  slug: string;
  workspaceId: string;
  currentRole: string;
  icon?: string | null;
  coverImage?: string | null;
}

interface BreadcrumbPage {
  id: string;
  title: string;
  parentId: string | null;
}

interface WorkspaceInfo {
  id: string;
  name: string;
}

export default function PageEditorPage() {
  const { workspaceId, pageId } = useParams<{ workspaceId: string; pageId: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const [activeEditors, setActiveEditors] = useState<{ name: string; color: string }[]>([]);
  const [page, setPage] = useState<PageData | null>(null);
  const [content, setContent] = useState<string>("");
  const [showHistory, setShowHistory] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const [headerHovered, setHeaderHovered] = useState(false);
  const [allPages, setAllPages] = useState<BreadcrumbPage[]>([]);
  const [workspaceInfo, setWorkspaceInfo] = useState<WorkspaceInfo | null>(null);
  const [editorResetVersion, setEditorResetVersion] = useState(0);
  const [pendingInsertMarkdown, setPendingInsertMarkdown] = useState<{
    key: number;
    markdown: string;
    afterBlockId?: string;
  } | null>(null);
  const [showToc, setShowToc] = useState(true);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [autocompleteLoading, setAutocompleteLoading] = useState(false);
  const [autocompleteError, setAutocompleteError] = useState<string | null>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const cursorContextRef = useRef<CursorContext | null>(null);
  const titleTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  const isReadOnly = page?.currentRole === "viewer";

  const handleAwarenessChange = useCallback(
    (users: { name: string; color: string }[]) => {
      setActiveEditors(users);
    },
    []
  );

  const displayedEditors = useMemo(() => activeEditors.slice(0, 5), [activeEditors]);

  const [isFavorited, setIsFavorited] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const fetchPage = useCallback(async () => {
    try {
      const [pageRes, contentRes] = await Promise.all([
        fetch(`/api/pages/${pageId}`),
        fetch(`/api/pages/${pageId}/content`),
      ]);

      if (!pageRes.ok) {
        setLoadError(true);
        return;
      }

      const pageData = await pageRes.json();
      setPage(pageData);
      setTitle(pageData.title);
      setIcon(pageData.icon || null);
      setCoverImage(pageData.coverImage || null);

      // Quick Switcher 최근 페이지 추적
      trackRecentPage(pageData.workspaceId, {
        id: pageData.id,
        title: pageData.title,
        slug: pageData.slug,
        icon: pageData.icon || null,
      });

      if (contentRes.ok) {
        const { content: c } = await contentRes.json();
        setContent(c);
      }
    } catch {
      setLoadError(true);
    }
  }, [pageId]);

  useEffect(() => {
    fetchPage();
    // 브레드크럼을 위한 페이지 목록 및 워크스페이스 정보 가져오기
    fetch(`/api/pages?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((pages: BreadcrumbPage[]) => setAllPages(pages))
      .catch(() => {});
    fetch(`/api/workspaces/${workspaceId}`)
      .then((r) => r.json())
      .then((ws: WorkspaceInfo) => setWorkspaceInfo(ws))
      .catch(() => {});
    // 즐겨찾기 상태 확인
    fetch(`/api/favorites?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((favs: { id: string }[]) => {
        setIsFavorited(favs.some((f) => f.id === pageId));
      })
      .catch(() => {});
  }, [fetchPage, workspaceId, pageId]);

  async function handleToggleFavorite() {
    const newState = !isFavorited;
    setIsFavorited(newState); // optimistic update
    try {
      if (newState) {
        await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageId }),
        });
      } else {
        await fetch("/api/favorites", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageId }),
        });
      }
    } catch {
      setIsFavorited(!newState); // revert on error
    }
  }

  function handleTitleChange(newTitle: string) {
    setTitle(newTitle);
    if (titleTimeout.current) clearTimeout(titleTimeout.current);
    titleTimeout.current = setTimeout(async () => {
      try {
        await fetch(`/api/pages/${pageId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitle }),
        });
        window.dispatchEvent(new Event("sidebar:refresh"));
      } catch {
        // 네트워크 오류 무시 — 다음 저장 시 재시도
      }
    }, 500);
  }

  async function handleIconChange(newIcon: string | null) {
    setIcon(newIcon);
    try {
      await fetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icon: newIcon }),
      });
      window.dispatchEvent(new Event("sidebar:refresh"));
    } catch {
      // 네트워크 오류 무시
    }
  }

  const [coverError, setCoverError] = useState<string | null>(null);

  async function handleCoverChange(newCover: string | null) {
    setCoverImage(newCover);
    setCoverError(null);
    try {
      const res = await fetch(`/api/pages/${pageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ coverImage: newCover }),
      });
      if (!res.ok) {
        setCoverError("커버 이미지 변경에 실패했습니다.");
        setCoverImage(page?.coverImage || null);
      }
    } catch {
      setCoverError("네트워크 오류로 커버를 변경할 수 없습니다.");
      setCoverImage(page?.coverImage || null);
    }
  }

  async function handleSave(markdown: string) {
    setContent(markdown);
    const res = await fetch(`/api/pages/${pageId}/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: markdown }),
    });
    if (!res.ok) throw new Error("Save failed");
  }

  async function handleAutocomplete() {
    if (autocompleteLoading || isReadOnly) return;

    setAutocompleteLoading(true);
    setAutocompleteError(null);

    const cursor = cursorContextRef.current;
    // Use text up to cursor if available, otherwise full document, otherwise let server read from pageId
    const textForAi = (cursor?.textBefore || content || "").trim();

    try {
      const res = await fetch("/api/ai/autocomplete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          pageId,
          ...(textForAi ? { text: textForAi } : {}),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "자동완성에 실패했습니다");
      }

      const markdown = typeof data.result === "string" ? data.result.trim() : "";
      if (!markdown) {
        throw new Error("비어 있는 응답이 반환되었습니다");
      }

      setPendingInsertMarkdown({
        key: Date.now(),
        markdown,
        afterBlockId: cursor?.blockId,
      });
    } catch (error) {
      setAutocompleteError(
        error instanceof Error ? error.message : "자동완성에 실패했습니다"
      );
    } finally {
      setAutocompleteLoading(false);
    }
  }

  // 더보기 메뉴 외부 클릭 닫기
  useEffect(() => {
    if (!showMoreMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showMoreMenu]);

  function handleExportMarkdown() {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "문서"}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function handleExportHtml() {
    const safeTitle = escapeHtml(title || "문서");
    const htmlContent = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; }
    h1 { border-bottom: 1px solid #eee; padding-bottom: 0.5rem; }
    pre { background: #f5f5f5; padding: 1rem; border-radius: 4px; overflow-x: auto; }
    code { background: #f5f5f5; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; }
    blockquote { border-left: 4px solid #ddd; margin-left: 0; padding-left: 1rem; color: #666; }
  </style>
</head>
<body>
  <h1>${safeTitle}</h1>
  <div>${content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</div>
</body>
</html>`;
    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "문서"}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Listen for AI slash command events from editor
  useEffect(() => {
    const onAutocomplete = () => handleAutocomplete();
    const onAiAction = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action: string } | undefined;
      if (detail?.action) {
        setShowAi(true);
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("ai:execute-action", { detail })
          );
        }, 100);
      }
    };
    const onOpenPanel = () => setShowAi(true);
    window.addEventListener("ai:autocomplete", onAutocomplete);
    window.addEventListener("ai:action", onAiAction);
    window.addEventListener("ai:open-panel", onOpenPanel);
    return () => {
      window.removeEventListener("ai:autocomplete", onAutocomplete);
      window.removeEventListener("ai:action", onAiAction);
      window.removeEventListener("ai:open-panel", onOpenPanel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autocompleteLoading, isReadOnly, content]);

  if (loadError) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-lg font-semibold mb-2">페이지를 불러올 수 없습니다</p>
          <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
            페이지가 삭제되었거나 접근 권한이 없습니다.
          </p>
          <button
            onClick={() => { setLoadError(false); fetchPage(); }}
            className="px-4 py-2 rounded text-sm text-white"
            style={{ background: "var(--primary)" }}
          >
            다시 시도
          </button>
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="h-full flex flex-col animate-pulse">
        <div className="flex items-center gap-2 px-4 py-2 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="h-4 rounded w-48" style={{ background: "var(--sidebar-hover)" }} />
          <div className="flex-1" />
          <div className="h-4 rounded w-24" style={{ background: "var(--sidebar-hover)" }} />
        </div>
        <div className="px-4 md:px-8 lg:px-16 pt-6 md:pt-12 pb-2">
          <div className="h-10 rounded w-64 mb-4" style={{ background: "var(--sidebar-hover)" }} />
        </div>
        <div className="flex-1 px-4 md:px-8 lg:px-16 space-y-3">
          <div className="h-4 rounded w-full" style={{ background: "var(--sidebar-hover)" }} />
          <div className="h-4 rounded w-3/4" style={{ background: "var(--sidebar-hover)" }} />
          <div className="h-4 rounded w-5/6" style={{ background: "var(--sidebar-hover)" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div
        className="flex items-center justify-between gap-2 px-4 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {/* 브레드크럼 */}
        <div className="min-w-0 flex-1">
          {workspaceInfo && (
            <Breadcrumb
              workspaceId={workspaceId}
              workspaceName={workspaceInfo.name}
              pages={allPages}
              currentPageId={pageId}
            />
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* 기본 표시: AI 이어쓰기, AI, 즐겨찾기 (항상 노출) */}
          {!isReadOnly && (
            <button
              onClick={handleAutocomplete}
              disabled={autocompleteLoading}
              className="flex items-center gap-1 px-2 py-1 rounded text-sm hover:opacity-70 disabled:opacity-60"
              style={{ color: "var(--primary)" }}
              title="문서 끝에서 이어쓰기"
            >
              <WandSparkles size={14} />
              <span className="hidden sm:inline">{autocompleteLoading ? "이어쓰기..." : "AI 이어쓰기"}</span>
            </button>
          )}
          <button
            onClick={() => setShowAi(!showAi)}
            className="flex items-center gap-1 px-2 py-1 rounded text-sm hover:opacity-70"
            style={{ color: "var(--primary)" }}
          >
            <Sparkles size={14} /> AI
          </button>
          <button
            onClick={handleToggleFavorite}
            className="flex items-center gap-1 px-2 py-1 rounded text-sm hover:opacity-70"
            style={{ color: isFavorited ? "var(--primary)" : "var(--muted)" }}
            title={isFavorited ? "즐겨찾기 해제" : "즐겨찾기 추가"}
          >
            <Star size={14} fill={isFavorited ? "currentColor" : "none"} />
          </button>

          {/* md 이상에서만 직접 표시되는 버튼들 */}
          <button
            onClick={() => setShowToc(!showToc)}
            className="hidden md:flex items-center gap-1 px-2 py-1 rounded text-sm hover:opacity-70"
            style={{ color: showToc ? "var(--primary)" : "var(--muted)" }}
            title="목차"
          >
            <ListTree size={14} /> 목차
          </button>
          <button
            onClick={() => setShowComments(!showComments)}
            className="hidden md:flex items-center gap-1 px-2 py-1 rounded text-sm hover:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            <MessageCircle size={14} /> 댓글
          </button>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="hidden md:flex items-center gap-1 px-2 py-1 rounded text-sm hover:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            <Clock size={14} /> 히스토리
          </button>
          <button
            onClick={() => router.push(`/workspace/${workspaceId}/graph`)}
            className="hidden md:flex items-center gap-1 px-2 py-1 rounded text-sm hover:opacity-70"
            style={{ color: "var(--muted)" }}
            title="그래프 뷰"
          >
            <Network size={14} />
          </button>
          <div className="relative hidden md:block">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1 px-2 py-1 rounded text-sm hover:opacity-70"
              style={{ color: "var(--muted)" }}
            >
              <Download size={14} /> 내보내기
            </button>
            {showExportMenu && (
              <div
                className="absolute right-0 top-full mt-1 rounded-lg shadow-xl py-1 z-50"
                style={{
                  background: "var(--background)",
                  border: "1px solid var(--border)",
                  minWidth: 180,
                }}
              >
                <button
                  onClick={handleExportMarkdown}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors"
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sidebar-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <FileText size={14} style={{ color: "var(--muted)" }} />
                  마크다운 (.md)
                </button>
                <button
                  onClick={handleExportHtml}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors"
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sidebar-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <FileText size={14} style={{ color: "var(--muted)" }} />
                  HTML (.html)
                </button>
              </div>
            )}
          </div>
          {!isReadOnly && (
            <button
              onClick={() => setShowShare(true)}
              className="hidden md:flex items-center gap-1 px-2 py-1 rounded text-sm hover:opacity-70"
              style={{ color: "var(--muted)" }}
            >
              <Share2 size={14} /> 공유
            </button>
          )}

          {/* 모바일 "더보기" 드롭다운 (md 미만에서만 표시) */}
          <div className="relative md:hidden" ref={moreMenuRef}>
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="flex items-center gap-1 px-2 py-1 rounded text-sm hover:opacity-70"
              style={{ color: "var(--muted)" }}
              title="더보기"
            >
              <MoreHorizontal size={16} />
            </button>
            {showMoreMenu && (
              <div
                className="absolute right-0 top-full mt-1 py-1 rounded-lg shadow-lg z-50 min-w-[160px]"
                style={{ background: "var(--background)", border: "1px solid var(--border)" }}
              >
                <button
                  onClick={() => { setShowToc(!showToc); setShowMoreMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:opacity-70"
                  style={{ color: showToc ? "var(--primary)" : "var(--foreground)" }}
                >
                  <ListTree size={14} /> 목차
                </button>
                <button
                  onClick={() => { setShowComments(!showComments); setShowMoreMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:opacity-70"
                  style={{ color: "var(--foreground)" }}
                >
                  <MessageCircle size={14} /> 댓글
                </button>
                <button
                  onClick={() => { setShowHistory(!showHistory); setShowMoreMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:opacity-70"
                  style={{ color: "var(--foreground)" }}
                >
                  <Clock size={14} /> 히스토리
                </button>
                <button
                  onClick={() => { router.push(`/workspace/${workspaceId}/graph`); setShowMoreMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:opacity-70"
                  style={{ color: "var(--foreground)" }}
                >
                  <Network size={14} /> 그래프
                </button>
                {!isReadOnly && (
                  <button
                    onClick={() => { setShowShare(true); setShowMoreMenu(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:opacity-70"
                    style={{ color: "var(--foreground)" }}
                  >
                    <Share2 size={14} /> 공유
                  </button>
                )}
                <button
                  onClick={() => { window.open(`/api/pages/${pageId}/export`, "_blank"); setShowMoreMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:opacity-70"
                  style={{ color: "var(--foreground)" }}
                >
                  <Download size={14} /> 내보내기
                </button>
              </div>
            )}
          </div>

          {/* 현재 편집 중인 사용자 아바타 */}
          {displayedEditors.length > 0 && (
            <div className="flex items-center gap-1 ml-1">
              <span className="text-[10px] hidden sm:inline" style={{ color: "var(--muted)" }}>
                편집 중
              </span>
              <div className="flex -space-x-1.5">
                {displayedEditors.map((editor, idx) => (
                  <div
                    key={idx}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{
                      background: editor.color,
                      border: "2px solid var(--background)",
                    }}
                    title={editor.name}
                  >
                    {editor.name.charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
              {activeEditors.length > 5 && (
                <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                  +{activeEditors.length - 5}
                </span>
              )}
            </div>
          )}

          {isReadOnly && (
            <span className="text-xs px-2 py-1 rounded" style={{ background: "var(--sidebar-hover)", color: "var(--muted)" }}>
              읽기 전용
            </span>
          )}
        </div>
      </div>

      {/* AI Summary Badge */}
      <AiSummaryBadge
        pageId={pageId}
        summary={aiSummary}
        onUpdate={(s) => setAiSummary(s)}
      />
      {autocompleteError && (
        <div
          className="mx-4 md:mx-8 lg:mx-16 mt-3 px-3 py-2 rounded text-sm"
          style={{
            background: "rgba(239,68,68,0.08)",
            color: "var(--danger, #ef4444)",
            border: "1px solid rgba(239,68,68,0.18)",
          }}
        >
          {autocompleteError}
        </div>
      )}

      {/* Cover Image */}
      {coverImage && (
        <div className="relative shrink-0 group">
          <div
            className="w-full"
            style={{
              height: 200,
              ...(coverImage.startsWith("linear-gradient")
                ? { background: coverImage }
                : {
                    backgroundImage: `url(${coverImage})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }),
            }}
          />
          {!isReadOnly && (
            <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => setShowCoverPicker(true)}
                className="px-3 py-1.5 rounded text-xs"
                style={{
                  background: "var(--background)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                }}
              >
                커버 변경
              </button>
            </div>
          )}
          {showCoverPicker && (
            <div className="absolute bottom-3 right-3">
              <CoverPicker
                pageId={pageId}
                workspaceId={workspaceId}
                onSelect={handleCoverChange}
                onClose={() => setShowCoverPicker(false)}
              />
            </div>
          )}
        </div>
      )}

      {/* Cover error */}
      {coverError && (
        <div
          className="mx-4 md:mx-8 lg:mx-16 mt-2 px-3 py-2 rounded text-sm flex items-center justify-between"
          style={{
            background: "rgba(239,68,68,0.08)",
            color: "#ef4444",
            border: "1px solid rgba(239,68,68,0.18)",
          }}
        >
          <span>{coverError}</span>
          <button
            onClick={() => setCoverError(null)}
            style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16 }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Icon & Title area */}
      <div
        className="px-4 md:px-8 lg:px-16 pt-6 md:pt-12 pb-2 relative"
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => setHeaderHovered(false)}
      >
        {/* Hover buttons for adding icon/cover */}
        {!isReadOnly && headerHovered && (!icon || !coverImage) && (
          <div className="flex gap-2 mb-2">
            {!icon && (
              <button
                onClick={() => setShowEmojiPicker(true)}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-opacity"
                style={{ color: "var(--muted)", background: "var(--sidebar-hover)" }}
              >
                <SmilePlus size={14} /> 아이콘 추가
              </button>
            )}
            {!coverImage && (
              <button
                onClick={() => setShowCoverPicker(true)}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-opacity"
                style={{ color: "var(--muted)", background: "var(--sidebar-hover)" }}
              >
                <ImageIcon size={14} /> 커버 추가
              </button>
            )}
          </div>
        )}

        {/* Icon */}
        {icon && (
          <div className="relative inline-block mb-2">
            <button
              onClick={() => !isReadOnly && setShowEmojiPicker(true)}
              className="text-[40px] leading-none hover:opacity-80 transition-opacity cursor-pointer"
              style={{ background: "transparent", border: "none" }}
              disabled={isReadOnly}
            >
              {icon}
            </button>
            {showEmojiPicker && (
              <div className="absolute top-full left-0 mt-1">
                <EmojiPicker
                  onSelect={handleIconChange}
                  onClose={() => setShowEmojiPicker(false)}
                />
              </div>
            )}
          </div>
        )}

        {/* Emoji picker when no icon */}
        {!icon && showEmojiPicker && (
          <div className="relative inline-block mb-2">
            <EmojiPicker
              onSelect={handleIconChange}
              onClose={() => setShowEmojiPicker(false)}
            />
          </div>
        )}

        {/* Cover picker when no cover */}
        {!coverImage && showCoverPicker && (
          <div className="relative inline-block mb-2">
            <CoverPicker
              pageId={pageId}
              workspaceId={workspaceId}
              onSelect={handleCoverChange}
              onClose={() => setShowCoverPicker(false)}
            />
          </div>
        )}

        {/* Title */}
        <input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          disabled={isReadOnly}
          placeholder="제목 없음"
          aria-label="페이지 제목"
          className="w-full text-4xl font-bold bg-transparent outline-none"
        />
      </div>

      {/* Editor + TOC */}
      <div className="flex-1 overflow-auto flex" ref={editorContainerRef}>
        <div className="flex-1 px-4 md:px-8 lg:px-16">
          <CollaborativeEditor
            pageId={pageId}
            workspaceId={workspaceId}
            initialContent={content}
            readOnly={isReadOnly}
            resetVersion={editorResetVersion}
            pendingInsertMarkdown={pendingInsertMarkdown}
            userName={session?.user?.name || "익명"}
            onSave={handleSave}
            title={title}
            onRemoteTitleChange={(remoteTitle) => {
              if (remoteTitle !== title) {
                setTitle(remoteTitle);
              }
            }}
            onCursorContextChange={(ctx) => { cursorContextRef.current = ctx; }}
            onAwarenessChange={handleAwarenessChange}
          />
          {!isReadOnly && (
            <BacklinkSuggestion
              workspaceId={workspaceId}
              editorElement={editorContainerRef.current}
              onInsert={() => {/* save triggers on change */}}
            />
          )}
          <RelatedPagesPanel workspaceId={workspaceId} pageId={pageId} />
        </div>

        {/* Table of Contents */}
        {showToc && (
          <div
            className="sticky top-0 shrink-0 py-4 pr-4 hidden lg:block"
            style={{ height: "fit-content", maxHeight: "calc(100vh - 120px)", overflowY: "auto" }}
          >
            <TableOfContents
              content={content}
              editorContainerRef={editorContainerRef}
            />
          </div>
        )}
      </div>

      {/* Backlinks */}
      <BacklinkPanel pageId={pageId} workspaceId={workspaceId} />

      {/* Attachments */}
      <AttachmentPanel
        pageId={pageId}
        workspaceId={workspaceId}
        readOnly={isReadOnly}
      />

      {/* History panel */}
      {showHistory && (
        <HistoryPanel
          pageId={pageId}
          onClose={() => setShowHistory(false)}
          onRestore={(c: string) => {
            setContent(c);
            setEditorResetVersion((prev) => prev + 1);
            handleSave(c);
          }}
        />
      )}

      {/* Comment panel */}
      {showComments && (
        <CommentPanel
          pageId={pageId}
          onClose={() => setShowComments(false)}
          readOnly={isReadOnly}
        />
      )}

      {/* AI panel */}
      {showAi && (
        <AiPanel
          workspaceId={workspaceId}
          pageId={pageId}
          pageContent={content}
          isOpen={showAi}
          onClose={() => setShowAi(false)}
          onInsertText={(text) => {
            setPendingInsertMarkdown({
              key: Date.now(),
              markdown: text,
            });
          }}
        />
      )}

      {/* Share dialog */}
      {showShare && (
        <ShareDialog
          workspaceId={workspaceId}
          pageId={pageId}
          pageTitle={page.title}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
