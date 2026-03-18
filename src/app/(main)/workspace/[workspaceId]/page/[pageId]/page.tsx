"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { CursorContext } from "@/components/editor/CollaborativeEditor";
import { AI_EVENTS, SEARCH_EVENTS, SIDEBAR_EVENTS } from "@/lib/events";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { BacklinkPanel } from "@/components/editor/BacklinkPanel";
import { AttachmentPanel } from "@/components/editor/AttachmentPanel";
import { BacklinkSuggestion } from "@/components/editor/BacklinkSuggestion";
import { HistoryPanel } from "@/components/editor/HistoryPanel";
import { RelatedPagesPanel } from "@/components/editor/RelatedPagesPanel";
import { ShareDialog } from "@/components/workspace/ShareDialog";
import { CommentPanel } from "@/components/editor/CommentPanel";
import { AiPanel } from "@/components/ai/AiPanel";
import { WordCount } from "@/components/editor/WordCount";
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
  Lock,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Network,
  Printer,
  Search,
  Share2,
  SmilePlus,
  Sparkles,
  Star,
  Tag,
  Unlock,
  WandSparkles,
  X,
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
  isLocked?: boolean;
  lockedById?: string | null;
  lockedByName?: string | null;
  lockedAt?: string | null;
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
  const [undoToast, setUndoToast] = useState(false);
  const cursorContextRef = useRef<CursorContext | null>(null);
  const autocompleteAbortRef = useRef<AbortController | null>(null);
  const undoToastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const titleTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  const currentUserId = (session?.user as { id?: string } | undefined)?.id;
  const isLockedByOther = page?.isLocked === true && page?.lockedById !== currentUserId;
  const isLockedByMe = page?.isLocked === true && page?.lockedById === currentUserId;
  const isReadOnly = page?.currentRole === "viewer" || isLockedByOther;

  const handleAwarenessChange = useCallback(
    (users: { name: string; color: string }[]) => {
      setActiveEditors(users);
    },
    []
  );

  const displayedEditors = useMemo(() => activeEditors.slice(0, 5), [activeEditors]);

  const [isFavorited, setIsFavorited] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [commentCount, setCommentCount] = useState(0);

  // --- Task 1: Page Tags ---
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);

  // --- Task 4: AI Tag Suggestions ---
  const [aiTagSuggestions, setAiTagSuggestions] = useState<string[]>([]);
  const [aiTagLoading, setAiTagLoading] = useState(false);

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

      // 댓글 카운트 조회
      fetch(`/api/pages/${pageId}/comments`)
        .then((r) => r.ok ? r.json() : [])
        .then((comments) => {
          if (Array.isArray(comments)) {
            const total = comments.reduce(
              (sum: number, c: { replies?: unknown[] }) => sum + 1 + (c.replies?.length || 0),
              0
            );
            setCommentCount(total);
          }
        })
        .catch((error: unknown) => { console.warn("[PageEditor] comment count fetch failed:", error); });
    } catch (error) {
      console.warn("[PageEditor] page fetch failed:", error);
      setLoadError(true);
    }
  }, [pageId]);

  useEffect(() => {
    fetchPage();
    // 브레드크럼을 위한 페이지 목록 및 워크스페이스 정보 가져오기
    fetch(`/api/pages?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((pages: BreadcrumbPage[]) => setAllPages(pages))
      .catch((error: unknown) => { console.warn("[PageEditor] pages list fetch failed:", error); });
    fetch(`/api/workspaces/${workspaceId}`)
      .then((r) => r.json())
      .then((ws: WorkspaceInfo) => setWorkspaceInfo(ws))
      .catch((error: unknown) => { console.warn("[PageEditor] workspace info fetch failed:", error); });
    // 즐겨찾기 상태 확인
    fetch(`/api/favorites?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((favs: { id: string }[]) => {
        setIsFavorited(favs.some((f) => f.id === pageId));
      })
      .catch((error: unknown) => { console.warn("[PageEditor] favorites fetch failed:", error); });

    return () => {
      if (titleTimeout.current) clearTimeout(titleTimeout.current);
      if (undoToastTimer.current) clearTimeout(undoToastTimer.current);
    };
  }, [fetchPage, workspaceId, pageId]);

  // Load tags from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`page-tags:${pageId}`);
      if (stored) {
        const parsed = JSON.parse(stored) as string[];
        if (Array.isArray(parsed)) setTags(parsed);
      }
    } catch {
      // ignore parse errors
    }
  }, [pageId]);

  function saveTagsToStorage(newTags: string[]) {
    setTags(newTags);
    try {
      localStorage.setItem(`page-tags:${pageId}`, JSON.stringify(newTags));
    } catch {
      // ignore storage errors
    }
  }

  function handleAddTag(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    saveTagsToStorage([...tags, trimmed]);
    setTagInput("");
  }

  function handleRemoveTag(tag: string) {
    saveTagsToStorage(tags.filter((t) => t !== tag));
  }

  function handleTagInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddTag(tagInput);
    } else if (e.key === "Escape") {
      setShowTagInput(false);
      setTagInput("");
    }
  }

  // AI Tag Suggestion
  async function handleAiTagSuggestion() {
    if (aiTagLoading || !content.trim()) return;
    setAiTagLoading(true);
    setAiTagSuggestions([]);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          pageId,
          question: "이 문서의 핵심 키워드 5개를 쉼표로 나열하세요. 키워드만 출력.",
          usePageContext: true,
        }),
      });
      if (!res.ok) throw new Error("AI tag suggestion failed");

      // SSE streaming response
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") break;
          try {
            const parsed = JSON.parse(payload) as { text?: string };
            if (parsed.text) accumulated += parsed.text;
          } catch {
            // ignore
          }
        }
      }
      const suggested = accumulated
        .split(/[,，\n]/)
        .map((s) => s.trim().replace(/^[0-9]+\.\s*/, ""))
        .filter((s) => s.length > 0 && s.length < 30);
      setAiTagSuggestions(suggested.slice(0, 7));
    } catch (error) {
      console.warn("[PageEditor] AI tag suggestion failed:", error);
    } finally {
      setAiTagLoading(false);
    }
  }

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
      window.dispatchEvent(new Event(SIDEBAR_EVENTS.REFRESH));
    } catch (error) {
      console.warn("[PageEditor] toggle favorite failed:", error);
      setIsFavorited(!newState); // revert on error
    }
  }

  async function handleToggleLock() {
    if (!page) return;
    const shouldLock = !page.isLocked;
    try {
      const res = await fetch(`/api/pages/${pageId}/lock`, {
        method: shouldLock ? "POST" : "DELETE",
      });
      if (res.ok) {
        const data = await res.json() as { isLocked: boolean; lockedById?: string | null; lockedByName?: string | null; lockedAt?: string | null };
        setPage((prev) =>
          prev
            ? { ...prev, isLocked: data.isLocked, lockedById: data.lockedById ?? null, lockedByName: data.lockedByName ?? null, lockedAt: data.lockedAt ?? null }
            : prev
        );
      }
    } catch (error) {
      console.warn("[PageEditor] toggle lock failed:", error);
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
        window.dispatchEvent(new Event(SIDEBAR_EVENTS.REFRESH));
      } catch (_error) {
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
      window.dispatchEvent(new Event(SIDEBAR_EVENTS.REFRESH));
    } catch (_error) {
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
    } catch (error) {
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

  const handleAutocomplete = useCallback(async () => {
    if (autocompleteLoading || isReadOnly) return;

    const abortController = new AbortController();
    autocompleteAbortRef.current = abortController;

    setAutocompleteLoading(true);
    setAutocompleteError(null);

    const cursor = cursorContextRef.current;
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
        signal: abortController.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const errMsg = (data as { error?: string }).error || "";
        if (res.status === 429) {
          throw new Error("요청이 너무 많습니다. 잠시 후 다시 시도하세요.");
        } else if (res.status === 403) {
          throw new Error("AI 기능이 비활성화되어 있습니다. 설정을 확인하세요.");
        } else if (res.status === 500 && errMsg.toLowerCase().includes("not found")) {
          throw new Error("AI 모델을 찾을 수 없습니다. 프로필을 확인하세요.");
        }
        throw new Error(errMsg || "자동완성에 실패했습니다");
      }

      // SSE 스트리밍 읽기 — 전체 텍스트를 수집한 후 한번에 삽입
      const reader = res.body?.getReader();
      if (!reader) throw new Error("스트리밍을 지원하지 않습니다");

      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") break;
          try {
            const parsed = JSON.parse(payload) as { text?: string };
            if (parsed.text) {
              accumulated += parsed.text;
            }
          } catch {
            // JSON 파싱 실패 무시
          }
        }
      }

      if (!accumulated.trim()) {
        throw new Error("비어 있는 응답이 반환되었습니다");
      }

      // 수집 완료 후 현재 커서 위치에 삽입
      // 슬래시 메뉴에서 호출 시 커서가 이동했을 수 있으므로 최신 커서 사용
      const latestCursor = cursorContextRef.current;
      setPendingInsertMarkdown({
        key: Date.now(),
        markdown: accumulated,
        afterBlockId: latestCursor?.blockId || cursor?.blockId,
      });

      // 성공 시 되돌리기 토스트 표시
      setUndoToast(true);
      if (undoToastTimer.current) clearTimeout(undoToastTimer.current);
      undoToastTimer.current = setTimeout(() => setUndoToast(false), 5000);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setAutocompleteError("요청 시간이 초과되었습니다.");
      } else {
        setAutocompleteError(
          error instanceof Error ? error.message : "자동완성에 실패했습니다"
        );
      }
    } finally {
      autocompleteAbortRef.current = null;
      setAutocompleteLoading(false);
    }
  }, [autocompleteLoading, isReadOnly, content, workspaceId, pageId]);

  const onRemoteTitleChange = useCallback((remoteTitle: string) => {
    setTitle((prev) => (remoteTitle !== prev ? remoteTitle : prev));
  }, []);

  // 새 페이지 생성 시 타이틀 인풋에 자동 포커스
  useEffect(() => {
    if (page && (page.title === "제목 없음" || !page.title.trim())) {
      const titleInput = document.querySelector("[data-title-input]") as HTMLElement;
      titleInput?.focus();
    }
  }, [page]);

  const onInsertText = useCallback((text: string) => {
    setPendingInsertMarkdown({
      key: Date.now(),
      markdown: text,
    });
  }, []);

  // ESC로 자동완성 취소
  useEffect(() => {
    if (!autocompleteLoading) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        autocompleteAbortRef.current?.abort();
        setAutocompleteLoading(false);
      }
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [autocompleteLoading]);

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
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.7; color: #1a1a1a; background: #ffffff; }
    h1 { font-size: 2em; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.5rem; margin-top: 1.5rem; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3rem; margin-top: 1.3rem; }
    h3 { font-size: 1.25em; margin-top: 1.2rem; }
    h4, h5, h6 { margin-top: 1rem; }
    p { margin: 0.8em 0; }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    pre { background: #f3f4f6; padding: 1rem; border-radius: 6px; overflow-x: auto; font-size: 0.9em; border: 1px solid #e5e7eb; }
    code { background: #f3f4f6; padding: 0.2em 0.4em; border-radius: 3px; font-size: 0.9em; font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid #d1d5db; margin-left: 0; padding-left: 1rem; color: #6b7280; }
    ul, ol { padding-left: 1.5em; margin: 0.5em 0; }
    li { margin: 0.25em 0; }
    table { border-collapse: collapse; width: 100%; margin: 1em 0; }
    th, td { border: 1px solid #d1d5db; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #f3f4f6; font-weight: 600; }
    tr:nth-child(even) { background: #f9fafb; }
    img { max-width: 100%; height: auto; border-radius: 4px; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0; }
    .task-list-item { list-style: none; }
    .task-list-item input[type="checkbox"] { margin-right: 0.5em; }
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

  function handleExportPdf() {
    window.print();
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
            new CustomEvent(AI_EVENTS.EXECUTE_ACTION, { detail })
          );
        }, 100);
      }
    };
    const onOpenPanel = () => setShowAi(true);
    window.addEventListener(AI_EVENTS.AUTOCOMPLETE, onAutocomplete);
    window.addEventListener(AI_EVENTS.ACTION, onAiAction);
    window.addEventListener(AI_EVENTS.OPEN_PANEL, onOpenPanel);
    return () => {
      window.removeEventListener(AI_EVENTS.AUTOCOMPLETE, onAutocomplete);
      window.removeEventListener(AI_EVENTS.ACTION, onAiAction);
      window.removeEventListener(AI_EVENTS.OPEN_PANEL, onOpenPanel);
    };
  }, [handleAutocomplete]);

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
      <div className="max-w-4xl mx-auto p-8 space-y-4 animate-pulse">
        <div className="h-8 rounded" style={{ background: "var(--sidebar-bg)", width: "60%" }} />
        <div className="h-4 rounded" style={{ background: "var(--sidebar-bg)", width: "100%" }} />
        <div className="h-4 rounded" style={{ background: "var(--sidebar-bg)", width: "85%" }} />
        <div className="h-4 rounded" style={{ background: "var(--sidebar-bg)", width: "90%" }} />
        <div className="h-32 rounded" style={{ background: "var(--sidebar-bg)" }} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div
        data-no-print
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
        <div className="flex items-center gap-2 shrink-0 overflow-visible">
          {/* AI 버튼 (이어쓰기 통합) */}
          <button
            onClick={() => setShowAi(!showAi)}
            className="flex items-center gap-1 px-2 py-1 rounded text-sm hover:opacity-70"
            style={{ color: showAi ? "var(--primary)" : "var(--muted)" }}
          >
            <Sparkles size={14} /> AI
          </button>
          {/* 검색 버튼 */}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent(SEARCH_EVENTS.OPEN))}
            className="flex items-center gap-1 px-2 py-1 rounded text-sm hover:opacity-70"
            style={{ color: "var(--muted)" }}
            title="검색 (Ctrl+K)"
            aria-label="검색"
          >
            <Search size={14} />
            <span className="hidden sm:inline">검색</span>
          </button>
          <button
            onClick={handleToggleFavorite}
            className="flex items-center gap-1 px-2 py-1 rounded text-sm hover:opacity-70"
            style={{ color: isFavorited ? "var(--primary)" : "var(--muted)" }}
            title={isFavorited ? "즐겨찾기 해제" : "즐겨찾기 추가"}
            aria-label={isFavorited ? "즐겨찾기 해제" : "즐겨찾기 추가"}
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
            style={{ color: showComments ? "var(--primary)" : "var(--muted)" }}
          >
            <MessageCircle size={14} /> 댓글
            {commentCount > 0 && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ background: "var(--primary)", color: "white" }}
              >
                {commentCount}
              </span>
            )}
          </button>
          <div className="hidden md:block">
            <NotificationBell workspaceId={workspaceId} />
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="hidden md:flex items-center px-2 py-1 rounded text-sm hover:opacity-70"
            style={{ color: showHistory ? "var(--primary)" : "var(--muted)" }}
            title="히스토리"
            aria-label="히스토리"
          >
            <Clock size={14} />
          </button>
          <button
            onClick={() => router.push(`/workspace/${workspaceId}/graph`)}
            className="hidden md:flex items-center gap-1 px-2 py-1 rounded text-sm hover:opacity-70"
            style={{ color: "var(--muted)" }}
            title="그래프 뷰"
            aria-label="그래프 뷰"
          >
            <Network size={14} />
          </button>
          <div className="relative hidden md:block">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center px-2 py-1 rounded text-sm hover:opacity-70"
              style={{ color: "var(--muted)" }}
              title="내보내기"
              aria-label="내보내기"
            >
              <Download size={14} />
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
                <button
                  onClick={handleExportPdf}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors"
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sidebar-hover)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <Printer size={14} style={{ color: "var(--muted)" }} />
                  PDF (인쇄)
                </button>
              </div>
            )}
          </div>
          {/* 잠금 버튼 */}
          {page?.currentRole !== "viewer" && (
            <button
              onClick={handleToggleLock}
              className="hidden md:flex items-center gap-1 px-2 py-1 rounded text-sm hover:opacity-70"
              style={{ color: isLockedByOther ? "var(--danger, #ef4444)" : isLockedByMe ? "var(--primary)" : "var(--muted)" }}
              title={
                isLockedByOther
                  ? `잠김 (by ${page?.lockedByName || "다른 사용자"})`
                  : isLockedByMe
                    ? "잠금 해제"
                    : "페이지 잠금"
              }
              disabled={isLockedByOther}
            >
              {page?.isLocked ? <Lock size={14} /> : <Unlock size={14} />}
            </button>
          )}
          {!isReadOnly && (
            <button
              onClick={() => setShowShare(true)}
              className="hidden md:flex items-center px-2 py-1 rounded text-sm hover:opacity-70"
              style={{ color: "var(--muted)" }}
              title="공유"
              aria-label="공유"
            >
              <Share2 size={14} />
            </button>
          )}

          {/* 모바일 "더보기" 드롭다운 (md 미만에서만 표시) */}
          <div className="relative md:hidden" ref={moreMenuRef}>
            <button
              onClick={() => setShowMoreMenu(!showMoreMenu)}
              className="flex items-center gap-1 px-2 py-1 rounded text-sm hover:opacity-70"
              style={{ color: "var(--muted)" }}
              title="더보기"
              aria-label="더보기"
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
                  {commentCount > 0 && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-auto"
                      style={{ background: "var(--primary)", color: "white" }}
                    >
                      {commentCount}
                    </span>
                  )}
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

          {isLockedByOther && (
            <span className="text-xs px-2 py-1 rounded flex items-center gap-1" style={{ background: "var(--sidebar-hover)", color: "var(--danger, #ef4444)" }}>
              <Lock size={12} /> 잠김 (by {page?.lockedByName || "다른 사용자"})
            </span>
          )}
          {isReadOnly && !isLockedByOther && (
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
          className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 max-w-md animate-in"
          style={{
            background: "#ef4444",
            color: "white",
          }}
          onClick={() => setAutocompleteError(null)}
          role="alert"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter") setAutocompleteError(null); }}
        >
          <span>AI: {autocompleteError}</span>
          <span className="text-xs opacity-70">(클릭하여 닫기)</span>
        </div>
      )}
      {autocompleteLoading && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full shadow-lg text-sm font-medium flex items-center gap-2"
          style={{
            background: "var(--primary)",
            color: "white",
          }}
          role="status"
        >
          <Loader2 size={14} className="animate-spin" />
          AI 이어쓰기 생성 중... (ESC로 취소)
        </div>
      )}
      {undoToast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg text-sm font-medium flex items-center gap-3"
          style={{
            background: "var(--foreground)",
            color: "var(--background)",
          }}
        >
          <span>AI 이어쓰기 삽입됨</span>
          <button
            onClick={() => {
              document.dispatchEvent(
                new KeyboardEvent("keydown", {
                  key: "z",
                  ctrlKey: true,
                  bubbles: true,
                })
              );
              setUndoToast(false);
            }}
            className="px-2 py-0.5 rounded text-xs font-semibold transition-opacity hover:opacity-80"
            style={{
              background: "var(--primary)",
              color: "white",
            }}
          >
            되돌리기
          </button>
          <button
            onClick={() => setUndoToast(false)}
            className="text-xs opacity-60 hover:opacity-100"
          >
            닫기
          </button>
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
            color: "var(--danger, #ef4444)",
            border: "1px solid rgba(239,68,68,0.18)",
          }}
        >
          <span>{coverError}</span>
          <button
            onClick={() => setCoverError(null)}
            style={{ background: "none", border: "none", color: "var(--danger, #ef4444)", cursor: "pointer", fontSize: 16 }}
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
          data-title-input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          disabled={isReadOnly}
          placeholder="제목 없음"
          aria-label="페이지 제목"
          className="w-full text-4xl font-bold bg-transparent outline-none"
        />

        {/* Tags */}
        <div className="flex flex-wrap items-center gap-1.5 mt-2 min-h-[28px]">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium"
              style={{
                background: "color-mix(in srgb, var(--primary) 10%, transparent)",
                color: "var(--primary)",
              }}
            >
              <Tag size={10} />
              {tag}
              {!isReadOnly && (
                <button
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-0.5 hover:opacity-70"
                  aria-label={`태그 "${tag}" 삭제`}
                >
                  <X size={10} />
                </button>
              )}
            </span>
          ))}
          {!isReadOnly && !showTagInput && (
            <button
              onClick={() => setShowTagInput(true)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-opacity hover:opacity-70"
              style={{ color: "var(--muted)", border: "1px dashed var(--border)" }}
            >
              <Tag size={10} /> 태그 추가
            </button>
          )}
          {showTagInput && (
            <input
              autoFocus
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagInputKeyDown}
              onBlur={() => {
                if (tagInput.trim()) handleAddTag(tagInput);
                setShowTagInput(false);
              }}
              placeholder="태그 입력 (Enter로 추가)"
              className="px-2 py-0.5 rounded-full text-xs bg-transparent outline-none"
              style={{
                border: "1px solid var(--primary)",
                color: "var(--foreground)",
                minWidth: 120,
              }}
            />
          )}
          {/* AI Tag Suggestion Button */}
          {!isReadOnly && content.trim() && (
            <button
              onClick={handleAiTagSuggestion}
              disabled={aiTagLoading}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-opacity hover:opacity-70"
              style={{ color: "var(--muted)" }}
              title="AI 태그 제안"
            >
              {aiTagLoading ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <WandSparkles size={10} />
              )}
              AI 태그 제안
            </button>
          )}
        </div>

        {/* AI Tag Suggestions */}
        {aiTagSuggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span className="text-[10px]" style={{ color: "var(--muted)" }}>추천:</span>
            {aiTagSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => {
                  handleAddTag(suggestion);
                  setAiTagSuggestions((prev) => prev.filter((s) => s !== suggestion));
                }}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-opacity hover:opacity-80 cursor-pointer"
                style={{
                  background: "color-mix(in srgb, var(--primary) 6%, transparent)",
                  color: "var(--primary)",
                  border: "1px dashed color-mix(in srgb, var(--primary) 30%, transparent)",
                }}
              >
                + {suggestion}
              </button>
            ))}
            <button
              onClick={() => setAiTagSuggestions([])}
              className="text-[10px] hover:opacity-70"
              style={{ color: "var(--muted)" }}
            >
              닫기
            </button>
          </div>
        )}
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
            onRemoteTitleChange={onRemoteTitleChange}
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

      {/* Word count */}
      <WordCount content={content} />

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
          onInsertText={onInsertText}
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
