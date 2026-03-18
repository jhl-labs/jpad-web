"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { QuickSwitcher } from "@/components/ui/QuickSwitcher";
import { TemplatePickerModal } from "@/components/templates/TemplatePickerModal";
import { KeyboardShortcutsHelp } from "@/components/ui/KeyboardShortcutsHelp";
import { FeedbackModal } from "@/components/ui/FeedbackModal";
import { Menu } from "lucide-react";
import { ZEN_EVENTS, SEARCH_EVENTS, SIDEBAR_EVENTS } from "@/lib/events";

interface Page {
  id: string;
  title: string;
  slug: string;
  icon: string | null;
  position: number;
  parentId: string | null;
}

interface Workspace {
  id: string;
  name: string;
  currentRole: string;
}

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { status } = useSession();
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [pages, setPages] = useState<Page[]>([]);
  const [favorites, setFavorites] = useState<{ id: string; title: string; slug: string; icon: string | null }[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const pendingParentIdRef = useRef<string | undefined>(undefined);

  const fetchPages = useCallback(async () => {
    const res = await fetch(`/api/pages?workspaceId=${workspaceId}`);
    if (res.ok) setPages(await res.json());
  }, [workspaceId]);

  const fetchFavorites = useCallback(async () => {
    const res = await fetch(`/api/favorites?workspaceId=${workspaceId}`);
    if (res.ok) setFavorites(await res.json());
  }, [workspaceId]);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated") {
      fetch(`/api/workspaces/${workspaceId}`)
        .then((r) => r.json())
        .then(setWorkspace)
        .catch((error: unknown) => { console.warn("[WorkspaceLayout] workspace fetch failed:", error); });
      fetchPages();
      fetchFavorites();
    }
  }, [status, workspaceId, router, fetchPages, fetchFavorites]);

  // 모바일에서는 기본적으로 사이드바 숨김
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 768px)");
    if (mql.matches) setSidebarOpen(false);

    const handler = (e: MediaQueryListEvent) => {
      if (e.matches) setSidebarOpen(false);
      else setSidebarOpen(true);
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Cmd+K / Ctrl+K 단축키, Ctrl+\ Zen Mode
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        setZenMode((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 검색 이벤트 수신
  useEffect(() => {
    function handleSearchOpen() { setSearchOpen(true); }
    window.addEventListener(SEARCH_EVENTS.OPEN, handleSearchOpen);
    return () => window.removeEventListener(SEARCH_EVENTS.OPEN, handleSearchOpen);
  }, []);

  // Zen Mode 이벤트 수신
  useEffect(() => {
    function handleZenToggle() { setZenMode((prev) => !prev); }
    function handleZenExit() { setZenMode(false); }
    window.addEventListener(ZEN_EVENTS.TOGGLE, handleZenToggle);
    window.addEventListener(ZEN_EVENTS.EXIT, handleZenExit);
    return () => {
      window.removeEventListener(ZEN_EVENTS.TOGGLE, handleZenToggle);
      window.removeEventListener(ZEN_EVENTS.EXIT, handleZenExit);
    };
  }, []);

  // 페이지 메타데이터 변경 시 사이드바 갱신 (title, icon 등) — debounce로 빠른 연속 호출 방지
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    function handleRefresh() {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = setTimeout(() => {
        fetchPages();
        fetchFavorites();
      }, 300);
    }
    window.addEventListener("sidebar:refresh", handleRefresh);
    return () => {
      window.removeEventListener("sidebar:refresh", handleRefresh);
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, [fetchPages, fetchFavorites]);

  // 워크스페이스 홈에서 "템플릿에서 시작" 이벤트 수신
  useEffect(() => {
    function handleTemplateOpen() {
      pendingParentIdRef.current = undefined;
      setTemplatePickerOpen(true);
    }
    window.addEventListener("template-picker:open", handleTemplateOpen);
    return () => window.removeEventListener("template-picker:open", handleTemplateOpen);
  }, []);

  function handleCreatePage(parentId?: string) {
    pendingParentIdRef.current = parentId;
    setTemplatePickerOpen(true);
  }

  async function createPageWithContent(content: string, title: string) {
    const parentId = pendingParentIdRef.current;
    const res = await fetch("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, parentId, title }),
    });
    if (!res.ok) return;

    const page = await res.json();

    // 사이드바에 즉시 반영 (낙관적 업데이트)
    setPages((prev) => [...prev, page]);

    // 콘텐츠 저장 완료 후 페이지 이동 (저장 전 이동하면 빈 페이지)
    if (content) {
      await fetch(`/api/pages/${page.id}/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
    }

    router.push(`/workspace/${workspaceId}/page/${page.id}`);
  }

  async function createBlankPage() {
    const parentId = pendingParentIdRef.current;
    const res = await fetch("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, parentId }),
    });
    if (!res.ok) return;

    const page = await res.json();

    // 사이드바에 즉시 반영
    setPages((prev) => [...prev, page]);
    router.push(`/workspace/${workspaceId}/page/${page.id}`);

    // 서버에서 최신 목록 동기화
    fetchPages();
  }

  async function handleDeletePage(pageId: string, title: string) {
    if (!confirm(`"${title}" 페이지를 삭제하시겠습니까?\n하위 페이지도 함께 삭제될 수 있습니다.`)) return;
    const res = await fetch(`/api/pages/${pageId}`, { method: "DELETE" });
    if (res.ok) {
      await fetchPages();
      // 현재 보고 있는 페이지가 삭제되면 워크스페이스 홈으로 이동
      if (window.location.pathname.includes(pageId)) {
        router.push(`/workspace/${workspaceId}`);
      }
    }
  }

  if (!workspace) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8" style={{ border: "2px solid var(--border)", borderTopColor: "var(--primary)" }} />
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {!zenMode && (
        <Sidebar
          workspace={workspace}
          pages={pages}
          favorites={favorites}
          onCreatePage={handleCreatePage}
          onDeletePage={handleDeletePage}
          onRefresh={() => { fetchPages(); fetchFavorites(); }}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
        />
      )}
      {!zenMode && !sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="fixed top-3 left-3 z-30 p-2 rounded-lg"
          style={{ background: "var(--sidebar-hover)", zIndex: 30 }}
          title="사이드바 열기"
        >
          <Menu size={18} />
        </button>
      )}
      <main className="flex-1 overflow-auto relative">
        {children}
      </main>
      <QuickSwitcher
        workspaceId={workspaceId}
        isOpen={searchOpen}
        onClose={() => setSearchOpen(false)}
      />
      <KeyboardShortcutsHelp />
      <TemplatePickerModal
        workspaceId={workspaceId}
        isOpen={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
        onSelectTemplate={(content, title) => {
          setTemplatePickerOpen(false);
          createPageWithContent(content, title);
        }}
        onSelectBlank={() => {
          setTemplatePickerOpen(false);
          createBlankPage();
        }}
      />
      <FeedbackModal />
    </div>
  );
}
