"use client";

import { useParams, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { AppLogo } from "@/components/ui/AppLogo";
import {
  Plus, FileText, ChevronRight, ChevronDown, ChevronLeft, LogOut,
  Settings, GripVertical, Trash2, Star, Network, Copy, Link,
  FilePlus, Edit3, MoreHorizontal, StarOff, ExternalLink,
  Calendar, CheckSquare, BookOpen, Upload, ChevronsUpDown, Check,
  MessageSquarePlus, MoveRight, FolderInput, BookTemplate, ArrowUpDown,
} from "lucide-react";
import { ImportModal } from "@/components/editor/ImportModal";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { TrashPanel } from "./TrashPanel";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Page {
  id: string;
  title: string;
  slug: string;
  icon: string | null;
  position: number;
  parentId: string | null;
  updatedAt?: string;
}

interface FavoritePage {
  id: string;
  title: string;
  slug: string;
  icon: string | null;
}

interface SidebarProps {
  workspace: { id: string; name: string; currentRole: string };
  pages: Page[];
  favorites?: FavoritePage[];
  onCreatePage: (parentId?: string) => void;
  onDeletePage: (pageId: string, title: string) => void;
  onRefresh: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

// ── Blank Area Context Menu ───────────────────────────────────

function BlankAreaContextMenu({
  x, y, onCreatePage, onImport, onClose,
}: {
  x: number;
  y: number;
  onCreatePage: () => void;
  onImport: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleClick() { onClose(); }
    function handleEsc(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  return (
    <div
      className="fixed z-[100] rounded-lg shadow-xl py-1 min-w-[160px]"
      style={{
        left: x,
        top: y,
        background: "var(--background)",
        border: "1px solid var(--border)",
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        onClick={onCreatePage}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left"
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sidebar-hover)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <Plus size={14} /> 새 페이지
      </button>
      <button
        onClick={onImport}
        className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left"
        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sidebar-hover)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        <Upload size={14} /> 가져오기
      </button>
    </div>
  );
}

// ── Context Menu ──────────────────────────────────────────────

interface ContextMenuState {
  x: number;
  y: number;
  pageId: string;
  pageTitle: string;
  isFavorited: boolean;
}

function PageContextMenu({
  menu,
  workspaceId,
  canManagePages,
  canDelete,
  hasChildren,
  allPages,
  onCreatePage,
  onDeletePage,
  onRefresh,
  onClose,
}: {
  menu: ContextMenuState;
  workspaceId: string;
  canManagePages: boolean;
  canDelete: boolean;
  hasChildren: boolean;
  allPages: Page[];
  onCreatePage: (parentId?: string) => void;
  onDeletePage: (pageId: string, title: string) => void;
  onRefresh: () => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [newTitle, setNewTitle] = useState(menu.pageTitle);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [moveSearch, setMoveSearch] = useState("");
  const [showCopyToWs, setShowCopyToWs] = useState(false);
  const [copyWsList, setCopyWsList] = useState<{ id: string; name: string }[]>([]);
  const [copyLoading, setCopyLoading] = useState(false);
  const [showTemplateSave, setShowTemplateSave] = useState(false);
  const [templateName, setTemplateName] = useState(menu.pageTitle);
  const [templateSaving, setTemplateSaving] = useState(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  // Adjust position to stay in viewport
  const [pos, setPos] = useState({ x: menu.x, y: menu.y });
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      let { x, y } = menu;
      if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
      if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
      setPos({ x: Math.max(4, x), y: Math.max(4, y) });
    }
  }, [menu]);

  async function handleRename() {
    if (!newTitle.trim() || newTitle === menu.pageTitle) {
      onClose();
      return;
    }
    const res = await fetch(`/api/pages/${menu.pageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle }),
    });
    if (!res.ok) {
      console.error("페이지 이름 변경 실패:", res.status);
      window.dispatchEvent(new CustomEvent("toast", { detail: { message: "이름 변경에 실패했습니다" } }));
    }
    window.dispatchEvent(new Event("sidebar:refresh"));
    onClose();
  }

  async function handleDuplicate() {
    const res = await fetch("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId,
        title: `${menu.pageTitle} (복사본)`,
      }),
    });
    if (res.ok) {
      // Copy content
      const newPage = await res.json();
      const contentRes = await fetch(`/api/pages/${menu.pageId}/content`);
      if (contentRes.ok) {
        const { content } = await contentRes.json();
        const putRes = await fetch(`/api/pages/${newPage.id}/content`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });
        if (!putRes.ok) {
          console.error("페이지 콘텐츠 복사 실패:", putRes.status);
        }
      }
      onRefresh();
      router.push(`/workspace/${workspaceId}/page/${newPage.id}`);
      window.dispatchEvent(new CustomEvent("toast", { detail: { message: "페이지가 복제되었습니다" } }));
    } else {
      console.error("페이지 복제 실패:", res.status);
      window.dispatchEvent(new CustomEvent("toast", { detail: { message: "페이지 복제에 실패했습니다" } }));
    }
    onClose();
  }

  async function handleToggleFavorite() {
    const res = menu.isFavorited
      ? await fetch("/api/favorites", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageId: menu.pageId }),
        })
      : await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageId: menu.pageId }),
        });
    if (!res.ok) {
      console.error("즐겨찾기 변경 실패:", res.status);
    }
    onRefresh();
    onClose();
  }

  function handleCopyLink() {
    const url = `${window.location.origin}/workspace/${workspaceId}/page/${menu.pageId}`;
    navigator.clipboard.writeText(url).catch((error: unknown) => {
      console.warn("[Sidebar] clipboard write failed:", error);
    });
    onClose();
  }

  function handleOpenNewTab() {
    window.open(`/workspace/${workspaceId}/page/${menu.pageId}`, "_blank");
    onClose();
  }

  // 자기 자신과 하위 페이지 ID 수집 (이동 대상에서 제외)
  function getDescendantIds(parentId: string): string[] {
    const children = allPages.filter((p) => p.parentId === parentId);
    const ids: string[] = [];
    for (const child of children) {
      ids.push(child.id);
      ids.push(...getDescendantIds(child.id));
    }
    return ids;
  }

  const excludedIds = new Set([menu.pageId, ...getDescendantIds(menu.pageId)]);
  const moveTargets = allPages.filter((p) => !excludedIds.has(p.id));
  const filteredMoveTargets = moveTargets.filter((p) =>
    p.title.toLowerCase().includes(moveSearch.toLowerCase())
  );

  async function handleMovePage(targetParentId: string | null) {
    const res = await fetch(`/api/pages/${menu.pageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentId: targetParentId }),
    });
    if (!res.ok) {
      console.error("페이지 이동 실패:", res.status);
    }
    window.dispatchEvent(new Event("sidebar:refresh"));
    onRefresh();
    onClose();
  }

  async function handleOpenCopyToWorkspace() {
    setCopyLoading(true);
    setShowCopyToWs(true);
    try {
      const res = await fetch("/api/workspaces");
      if (res.ok) {
        const data: { id: string; name: string }[] = await res.json();
        setCopyWsList(data.filter((ws) => ws.id !== workspaceId));
      }
    } catch (error) {
      console.warn("[Sidebar] workspace list fetch failed:", error);
    } finally {
      setCopyLoading(false);
    }
  }

  async function handleCopyToWorkspace(targetWsId: string) {
    try {
      // 1. GET page content
      const contentRes = await fetch(`/api/pages/${menu.pageId}/content`);
      if (!contentRes.ok) {
        console.error("페이지 콘텐츠 조회 실패:", contentRes.status);
        return;
      }
      const { content } = await contentRes.json();

      // 2. POST new page in target workspace
      const createRes = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: targetWsId, title: menu.pageTitle }),
      });
      if (!createRes.ok) {
        console.error("페이지 생성 실패:", createRes.status);
        return;
      }
      const newPage: { id: string } = await createRes.json();

      // 3. PUT content
      const putRes = await fetch(`/api/pages/${newPage.id}/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!putRes.ok) {
        console.error("페이지 콘텐츠 복사 실패:", putRes.status);
        return;
      }

      // 4. Toast-like notification via custom event
      window.dispatchEvent(new CustomEvent("toast", { detail: { message: "다른 워크스페이스로 복사 완료" } }));
    } catch (error) {
      console.error("워크스페이스 복사 실패:", error);
    }
    onClose();
  }

  async function handleSaveAsTemplate() {
    if (!templateName.trim()) return;
    setTemplateSaving(true);
    try {
      // 1. GET page content
      const contentRes = await fetch(`/api/pages/${menu.pageId}/content`);
      if (!contentRes.ok) {
        console.error("페이지 콘텐츠 조회 실패:", contentRes.status);
        return;
      }
      const { content } = await contentRes.json();

      // 2. POST template
      const res = await fetch(`/api/workspaces/${workspaceId}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName.trim(),
          content,
          category: "custom",
        }),
      });
      if (!res.ok) {
        console.error("템플릿 저장 실패:", res.status);
        return;
      }

      window.dispatchEvent(new CustomEvent("toast", { detail: { message: "템플릿으로 저장되었습니다" } }));
    } catch (error) {
      console.error("템플릿 저장 실패:", error);
    } finally {
      setTemplateSaving(false);
    }
    onClose();
  }

  if (showCopyToWs) {
    return (
      <div
        ref={menuRef}
        role="dialog"
        aria-modal="true"
        className="fixed z-[100] rounded-lg shadow-xl py-1"
        style={{
          left: pos.x,
          top: pos.y,
          background: "var(--background)",
          border: "1px solid var(--border)",
          minWidth: 220,
          maxHeight: 320,
          overflow: "auto",
        }}
      >
        <div
          className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--muted)" }}
        >
          복사할 워크스페이스 선택
        </div>
        {copyLoading && (
          <div className="px-3 py-2 text-xs" style={{ color: "var(--muted)" }}>
            로딩 중...
          </div>
        )}
        {!copyLoading && copyWsList.length === 0 && (
          <div className="px-3 py-2 text-xs" style={{ color: "var(--muted)" }}>
            복사 가능한 워크스페이스가 없습니다
          </div>
        )}
        {copyWsList.map((ws) => (
          <button
            key={ws.id}
            onClick={() => handleCopyToWorkspace(ws.id)}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left transition-colors truncate"
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sidebar-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <FolderInput size={14} style={{ color: "var(--muted)" }} className="shrink-0" />
            <span className="truncate">{ws.name}</span>
          </button>
        ))}
      </div>
    );
  }

  if (showTemplateSave) {
    return (
      <div
        ref={menuRef}
        role="dialog"
        aria-modal="true"
        className="fixed z-[100] rounded-lg shadow-xl py-2 px-3"
        style={{
          left: pos.x,
          top: pos.y,
          background: "var(--background)",
          border: "1px solid var(--border)",
          minWidth: 240,
        }}
      >
        <p className="text-xs font-medium mb-2" style={{ color: "var(--foreground)" }}>
          템플릿 이름
        </p>
        <input
          autoFocus
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSaveAsTemplate();
            if (e.key === "Escape") onClose();
          }}
          className="w-full px-2 py-1.5 rounded text-sm bg-transparent outline-none mb-2"
          style={{ border: "1px solid var(--primary)" }}
          placeholder="템플릿 이름 입력"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveAsTemplate}
            disabled={templateSaving || !templateName.trim()}
            className="flex-1 px-3 py-1.5 rounded text-sm font-medium text-white transition-colors"
            style={{ background: "var(--primary)", opacity: templateSaving ? 0.6 : 1 }}
          >
            {templateSaving ? "저장 중..." : "저장"}
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors"
            style={{ border: "1px solid var(--border)", color: "var(--foreground)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sidebar-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            취소
          </button>
        </div>
      </div>
    );
  }

  if (showMoveMenu) {
    return (
      <div
        ref={menuRef}
        role="dialog"
        aria-modal="true"
        className="fixed z-[100] rounded-lg shadow-xl py-1"
        style={{
          left: pos.x,
          top: pos.y,
          background: "var(--background)",
          border: "1px solid var(--border)",
          minWidth: 220,
          maxHeight: 320,
          overflow: "auto",
        }}
      >
        <div
          className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--muted)" }}
        >
          이동할 위치 선택
        </div>
        <div className="px-2 pb-1">
          <input
            autoFocus
            value={moveSearch}
            onChange={(e) => setMoveSearch(e.target.value)}
            placeholder="페이지 검색..."
            className="w-full px-2 py-1.5 rounded text-xs bg-transparent outline-none mb-1"
            style={{ border: "1px solid var(--border)" }}
          />
        </div>
        <button
          onClick={() => handleMovePage(null)}
          className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left transition-colors"
          style={{ color: "var(--primary)" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sidebar-hover)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <MoveRight size={14} />
          루트로 이동
        </button>
        <div className="my-1" style={{ borderTop: "1px solid var(--border)" }} />
        {filteredMoveTargets.map((target) => (
          <button
            key={target.id}
            onClick={() => handleMovePage(target.id)}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left transition-colors truncate"
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sidebar-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            {target.icon ? (
              <span className="shrink-0">{target.icon}</span>
            ) : (
              <FileText size={14} style={{ color: "var(--muted)" }} className="shrink-0" />
            )}
            <span className="truncate">{target.title}</span>
          </button>
        ))}
        {filteredMoveTargets.length === 0 && (
          <div className="px-3 py-2 text-xs" style={{ color: "var(--muted)" }}>
            {moveSearch ? "검색 결과가 없습니다" : "이동 가능한 페이지가 없습니다"}
          </div>
        )}
      </div>
    );
  }

  if (confirmDelete) {
    return (
      <div
        ref={menuRef}
        role="dialog"
        aria-modal="true"
        className="fixed z-[100] rounded-lg shadow-xl py-2 px-3"
        style={{ left: pos.x, top: pos.y, background: "var(--background)", border: "1px solid var(--border)", minWidth: 220 }}
      >
        <p className="text-sm font-medium mb-1" style={{ color: "var(--foreground)" }}>
          정말 삭제하시겠습니까?
        </p>
        {hasChildren && (
          <p className="text-xs mb-2" style={{ color: "var(--danger, #ef4444)" }}>
            하위 페이지도 함께 삭제됩니다
          </p>
        )}
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={() => { onDeletePage(menu.pageId, menu.pageTitle); onClose(); }}
            className="flex-1 px-3 py-1.5 rounded text-sm font-medium text-white transition-colors"
            style={{ background: "var(--danger, #ef4444)" }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.9"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
          >
            삭제
          </button>
          <button
            onClick={() => setConfirmDelete(false)}
            className="flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors"
            style={{ border: "1px solid var(--border)", color: "var(--foreground)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sidebar-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            취소
          </button>
        </div>
      </div>
    );
  }

  if (renaming) {
    return (
      <div
        ref={menuRef}
        className="fixed z-[100] rounded-lg shadow-xl py-1 px-2"
        style={{ left: pos.x, top: pos.y, background: "var(--background)", border: "1px solid var(--border)", minWidth: 200 }}
      >
        <input
          autoFocus
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRename();
            if (e.key === "Escape") onClose();
          }}
          onBlur={handleRename}
          className="w-full px-2 py-1.5 rounded text-sm bg-transparent outline-none"
          style={{ border: "1px solid var(--primary)" }}
        />
      </div>
    );
  }

  const items: { icon: React.ReactNode; label: string; action: () => void; danger?: boolean; divider?: boolean; hidden?: boolean }[] = [
    { icon: <ExternalLink size={14} />, label: "새 탭에서 열기", action: handleOpenNewTab },
    { icon: <Link size={14} />, label: "링크 복사", action: handleCopyLink },
    { icon: <span />, label: "", action: () => {}, divider: true },
    { icon: <Edit3 size={14} />, label: "이름 변경", action: () => setRenaming(true), hidden: !canManagePages },
    { icon: <Copy size={14} />, label: "복제", action: handleDuplicate, hidden: !canManagePages },
    { icon: <MoveRight size={14} />, label: "이동", action: () => setShowMoveMenu(true), hidden: !canManagePages },
    { icon: <FolderInput size={14} />, label: "다른 워크스페이스로 복사", action: handleOpenCopyToWorkspace, hidden: !canManagePages },
    { icon: <FilePlus size={14} />, label: "하위 페이지 추가", action: () => { onCreatePage(menu.pageId); onClose(); }, hidden: !canManagePages },
    { icon: <BookTemplate size={14} />, label: "템플릿으로 저장", action: () => setShowTemplateSave(true), hidden: !canManagePages },
    { icon: <span />, label: "", action: () => {}, divider: true, hidden: !canManagePages },
    {
      icon: menu.isFavorited ? <StarOff size={14} /> : <Star size={14} />,
      label: menu.isFavorited ? "즐겨찾기 해제" : "즐겨찾기 추가",
      action: handleToggleFavorite,
    },
    { icon: <span />, label: "", action: () => {}, divider: true, hidden: !canDelete },
    { icon: <Trash2 size={14} />, label: "삭제", action: () => { setConfirmDelete(true); }, danger: true, hidden: !canDelete },
  ];

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[100] rounded-lg shadow-xl py-1"
      style={{ left: pos.x, top: pos.y, background: "var(--background)", border: "1px solid var(--border)", minWidth: 180 }}
    >
      {items.filter((i) => !i.hidden).map((item, idx) =>
        item.divider ? (
          <div key={`div-${idx}`} className="my-1" style={{ borderTop: "1px solid var(--border)" }} />
        ) : (
          <button
            key={item.label}
            role="menuitem"
            onClick={item.action}
            className="flex items-center gap-2.5 w-full px-3 py-1.5 text-sm text-left transition-colors"
            style={{ color: item.danger ? "var(--danger, #ef4444)" : undefined }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sidebar-hover)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            {item.icon}
            {item.label}
          </button>
        )
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 400;
const SIDEBAR_DEFAULT_WIDTH = 240;
const SIDEBAR_STORAGE_KEY = "jpad:sidebar-width";

interface SectionCollapseState {
  navigation: boolean;
  favorites: boolean;
  pages: boolean;
}

function getSavedSectionState(workspaceId: string): SectionCollapseState {
  try {
    const saved = localStorage.getItem(`jpad:sidebar-sections:${workspaceId}`);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<SectionCollapseState>;
      return {
        navigation: parsed.navigation ?? false,
        favorites: parsed.favorites ?? false,
        pages: parsed.pages ?? false,
      };
    }
  } catch (_error) {
    // ignore
  }
  return { navigation: false, favorites: false, pages: false };
}

function saveSectionState(workspaceId: string, state: SectionCollapseState) {
  try {
    localStorage.setItem(`jpad:sidebar-sections:${workspaceId}`, JSON.stringify(state));
  } catch (_error) {
    // ignore
  }
}

function getSavedWidth(): number {
  try {
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (saved) {
      const w = parseInt(saved, 10);
      if (w >= SIDEBAR_MIN_WIDTH && w <= SIDEBAR_MAX_WIDTH) return w;
    }
  } catch (error) { console.warn("[Sidebar] localStorage read failed:", error); }
  return SIDEBAR_DEFAULT_WIDTH;
}

export function Sidebar({ workspace, pages, favorites = [], onCreatePage, onDeletePage, onRefresh, isOpen, onToggle }: SidebarProps) {
  const router = useRouter();
  const { pageId } = useParams<{ pageId?: string }>();
  const { data: session } = useSession();
  const [showTrash, setShowTrash] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [pageFilter, setPageFilter] = useState("");
  const [sectionCollapse, setSectionCollapse] = useState<SectionCollapseState>(() => getSavedSectionState(workspace.id));

  const toggleSection = useCallback((section: keyof SectionCollapseState) => {
    setSectionCollapse((prev) => {
      const next = { ...prev, [section]: !prev[section] };
      saveSectionState(workspace.id, next);
      return next;
    });
  }, [workspace.id]);
  const [sortMode, setSortMode] = useState<"manual" | "name" | "updated">("manual");
  const [trashCount, setTrashCount] = useState(0);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [blankContextMenu, setBlankContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [wsDropdownOpen, setWsDropdownOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);
  const wsDropdownRef = useRef<HTMLDivElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState(getSavedWidth);
  const isResizingRef = useRef(false);
  const sidebarRef = useRef<HTMLElement>(null);

  // Mobile swipe-to-close
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = Math.abs(touch.clientY - touchStartRef.current.y);
    // 왼쪽으로 50px 이상 스와이프하고, 수직 이동이 과도하지 않을 때 닫기
    if (deltaX < -50 && deltaY < 100) {
      onToggle();
    }
    touchStartRef.current = null;
  }, [onToggle]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingRef.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    function onMouseMove(ev: MouseEvent) {
      if (!isResizingRef.current) return;
      const newWidth = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, startWidth + (ev.clientX - startX)));
      setSidebarWidth(newWidth);
    }

    function onMouseUp() {
      isResizingRef.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      // 최종 값 저장
      setSidebarWidth((w) => {
        try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(w)); } catch (error) { console.warn("[Sidebar] localStorage write failed:", error); }
        return w;
      });
    }

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, [sidebarWidth]);

  // Workspace dropdown: fetch workspaces when opened, cache results
  const wsListFetchedRef = useRef(false);
  useEffect(() => {
    if (!wsDropdownOpen) return;
    if (wsListFetchedRef.current && workspaces.length > 0) return;
    (async () => {
      try {
        const res = await fetch("/api/workspaces");
        if (res.ok) {
          const data = await res.json();
          setWorkspaces(data);
          wsListFetchedRef.current = true;
        }
      } catch (error) {
        console.warn("[Sidebar] workspace list fetch failed:", error);
      }
    })();
  }, [wsDropdownOpen, workspaces.length]);

  // Close workspace dropdown on outside click
  useEffect(() => {
    if (!wsDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (wsDropdownRef.current && !wsDropdownRef.current.contains(e.target as Node)) {
        setWsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [wsDropdownOpen]);

  // Ctrl+Shift+W 워크스페이스 전환 단축키 수신
  useEffect(() => {
    const handleToggle = () => setWsDropdownOpen((prev) => !prev);
    window.addEventListener("workspace-switcher:toggle", handleToggle);
    return () => window.removeEventListener("workspace-switcher:toggle", handleToggle);
  }, []);

  const canManagePages = workspace.currentRole !== "viewer";
  const canManageTrash =
    workspace.currentRole === "owner" || workspace.currentRole === "admin" || workspace.currentRole === "maintainer";
  const canDelete =
    workspace.currentRole === "owner" || workspace.currentRole === "admin" || workspace.currentRole === "maintainer";

  const favoriteIds = useMemo(() => new Set(favorites.map((f) => f.id)), [favorites]);

  const fetchTrashCount = useCallback(async () => {
    if (!canManageTrash) {
      setTrashCount(0);
      return;
    }
    try {
      const res = await fetch(`/api/trash?workspaceId=${workspace.id}`);
      if (res.ok) {
        const data = await res.json();
        setTrashCount(data.length);
      }
    } catch (error) {
      console.warn("[Sidebar] trash count fetch failed:", error);
    }
  }, [workspace.id, canManageTrash]);

  useEffect(() => {
    fetchTrashCount();
  }, [fetchTrashCount, pages]);

  const rootPages = useMemo(() => {
    let roots = pages.filter((p) => !p.parentId);
    if (pageFilter && pages.length > 10) {
      const lower = pageFilter.toLowerCase();
      roots = roots.filter((p) => p.title.toLowerCase().includes(lower));
    }
    if (sortMode === "name") return [...roots].sort((a, b) => a.title.localeCompare(b.title, "ko"));
    if (sortMode === "updated") return [...roots].sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime());
    return roots.sort((a, b) => a.position - b.position);
  }, [pages, sortMode, pageFilter]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const handleDragOver = useCallback(
    (event: { active: { id: string | number }; over: { id: string | number } | null }) => {
      const overId = event.over?.id?.toString() ?? null;
      const activeId = event.active.id.toString();
      if (overId && overId !== activeId) {
        setDropTargetId(overId);
      } else {
        setDropTargetId(null);
      }
    },
    []
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setDropTargetId(null);
      const { active, over } = event;
      if (!canManagePages) return;
      if (!over || active.id === over.id) return;

      const activeId = active.id.toString();
      const overId = over.id.toString();
      const activePage = pages.find((p) => p.id === activeId);
      const overPage = pages.find((p) => p.id === overId);
      if (!activePage || !overPage) return;

      // 같은 부모의 같은 레벨이면 순서 변경, 아니면 하위로 이동
      if (activePage.parentId === overPage.parentId) {
        await fetch(`/api/pages/${activeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ position: overPage.position }),
        });
      } else {
        // 다른 페이지의 하위로 이동
        await fetch(`/api/pages/${activeId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentId: overId }),
        });
      }
      onRefresh();
    },
    [pages, onRefresh, canManagePages]
  );

  const handleDragCancel = useCallback(() => {
    setDropTargetId(null);
  }, []);

  function handleContextMenu(e: React.MouseEvent, page: Page) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      pageId: page.id,
      pageTitle: page.title,
      isFavorited: favoriteIds.has(page.id),
    });
  }

  return (
    <aside
      ref={sidebarRef}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className={`
        h-full flex flex-col overflow-hidden shrink-0
        ${isOpen ? "" : "!w-0"}
        fixed md:relative z-50 md:z-auto
      `}
      style={{
        width: isOpen ? sidebarWidth : 0,
        minWidth: isOpen ? SIDEBAR_MIN_WIDTH : 0,
        maxWidth: SIDEBAR_MAX_WIDTH,
        background: "var(--sidebar-bg)",
        borderRight: isOpen ? "1px solid var(--border)" : "none",
        transition: isResizingRef.current ? "none" : "width 200ms ease-in-out, min-width 200ms ease-in-out",
        overflow: "hidden",
      }}
    >
      {/* 내부 콘텐츠 줄바꿈 방지 래퍼 */}
      <div style={{ minWidth: SIDEBAR_MIN_WIDTH }} className="flex flex-col h-full">

      {/* 모바일 오버레이 */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[-1] bg-black/50 md:hidden"
          onClick={onToggle}
        />
      )}

      {/* Workspace header */}
      <div className="p-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="mb-2 flex items-center justify-between gap-2">
          <AppLogo />
          <div className="flex items-center gap-1">
            {(workspace.currentRole === "owner" || workspace.currentRole === "admin") && (
              <button
                onClick={() => router.push(`/workspace/${workspace.id}/settings`)}
                className="p-1 rounded hover:opacity-70"
                title="워크스페이스 설정"
                aria-label="워크스페이스 설정"
              >
                <Settings size={14} />
              </button>
            )}
            <button
              onClick={onToggle}
              className="p-1 rounded hover:opacity-70"
              title="사이드바 접기"
              aria-label="사이드바 접기"
            >
              <ChevronLeft size={14} />
            </button>
          </div>
        </div>
        <div className="relative" ref={wsDropdownRef}>
          <button
            onClick={() => setWsDropdownOpen(!wsDropdownOpen)}
            className="w-full flex items-center justify-between gap-1 text-sm font-semibold rounded-md px-1.5 py-1 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          >
            <span className="truncate">{workspace.name}</span>
            <ChevronsUpDown size={13} style={{ color: "var(--muted)" }} className="shrink-0" />
          </button>
          {wsDropdownOpen && (
            <div
              className="absolute left-0 top-full mt-1 w-full rounded-lg shadow-lg py-1 z-[60]"
              style={{
                background: "var(--background)",
                border: "1px solid var(--border)",
                minWidth: "200px",
              }}
            >
              <div
                className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted)" }}
              >
                워크스페이스
              </div>
              {workspaces.map((ws) => (
                <button
                  key={ws.id}
                  onClick={() => {
                    setWsDropdownOpen(false);
                    if (ws.id !== workspace.id) {
                      router.push(`/workspace/${ws.id}`);
                    }
                  }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left transition-colors"
                  style={{
                    background: ws.id === workspace.id ? "var(--sidebar-bg)" : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--sidebar-hover, var(--sidebar-bg))";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = ws.id === workspace.id ? "var(--sidebar-bg)" : "transparent";
                  }}
                >
                  <span className="truncate flex-1">{ws.name}</span>
                  {ws.id === workspace.id && (
                    <Check size={14} style={{ color: "var(--primary)" }} className="shrink-0" />
                  )}
                </button>
              ))}
              {workspaces.length === 0 && (
                <div className="px-3 py-2 text-xs" style={{ color: "var(--muted)" }}>
                  로딩 중...
                </div>
              )}
              {(workspace.currentRole === "owner" || workspace.currentRole === "admin") && (
                <>
                  <div className="my-1" style={{ borderTop: "1px solid var(--border)" }} />
                  <button
                    onClick={() => {
                      setWsDropdownOpen(false);
                      router.push(`/workspace/${workspace.id}/settings`);
                    }}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left transition-colors"
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "var(--sidebar-hover, var(--sidebar-bg))";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <Settings size={14} style={{ color: "var(--muted)" }} className="shrink-0" />
                    <span>워크스페이스 설정</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Navigation + Page tree */}
      <div
        className="flex-1 overflow-auto"
        onContextMenu={(e) => {
          // 페이지 아이템의 컨텍스트 메뉴가 아닌 경우 (빈 공간)
          if (canManagePages && !(e.target as HTMLElement).closest("[role='treeitem']")) {
            e.preventDefault();
            setBlankContextMenu({ x: e.clientX, y: e.clientY });
          }
        }}
      >
        {/* 네비게이션 메뉴 */}
        <div className="px-2 pt-2 pb-1">
          <button
            onClick={() => toggleSection("navigation")}
            className="flex items-center gap-1 w-full px-1 mb-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--muted)", background: "transparent", border: "none", cursor: "pointer" }}
          >
            {sectionCollapse.navigation ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
            네비게이션
          </button>
          {!sectionCollapse.navigation && [
            { href: "daily", icon: <BookOpen size={14} />, label: "오늘의 노트" },
            { href: "graph", icon: <Network size={14} />, label: "지식 그래프" },
            { href: "calendar", icon: <Calendar size={14} />, label: "캘린더" },
            { href: "todos", icon: <CheckSquare size={14} />, label: "할 일" },
          ].map((nav) => (
            <button
              key={nav.href}
              onClick={() => router.push(`/workspace/${workspace.id}/${nav.href}`)}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm"
              style={{
                color: "var(--foreground)",
                opacity: 0.7,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sidebar-hover)"; e.currentTarget.style.opacity = "1"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.opacity = "0.7"; }}
            >
              {nav.icon} {nav.label}
            </button>
          ))}
        </div>

        <div className="mx-2 my-1" style={{ borderTop: "1px solid var(--border)" }} />

        {/* 즐겨찾기 */}
        {favorites.length > 0 && (
          <div className="px-2 mb-1">
            <button
              onClick={() => toggleSection("favorites")}
              className="flex items-center gap-1 w-full mb-1 px-1 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--muted)", background: "transparent", border: "none", cursor: "pointer" }}
            >
              {sectionCollapse.favorites ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
              즐겨찾기
            </button>
            {!sectionCollapse.favorites && favorites.map((fav) => (
              <div
                key={fav.id}
                role="button"
                tabIndex={0}
                className="flex items-center gap-1.5 rounded px-2 py-1 cursor-pointer text-sm"
                style={{
                  background: fav.id === pageId ? "var(--sidebar-hover)" : undefined,
                }}
                onMouseEnter={(e) => {
                  if (fav.id !== pageId) e.currentTarget.style.background = "var(--sidebar-hover)";
                }}
                onMouseLeave={(e) => {
                  if (fav.id !== pageId) e.currentTarget.style.background = "transparent";
                }}
                onClick={() => router.push(`/workspace/${workspace.id}/page/${fav.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/workspace/${workspace.id}/page/${fav.id}`);
                  }
                  if (e.key === "F10" && e.shiftKey) {
                    e.preventDefault();
                    const rect = e.currentTarget.getBoundingClientRect();
                    setContextMenu({
                      x: rect.left,
                      y: rect.bottom,
                      pageId: fav.id,
                      pageTitle: fav.title,
                      isFavorited: true,
                    });
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({
                    x: e.clientX,
                    y: e.clientY,
                    pageId: fav.id,
                    pageTitle: fav.title,
                    isFavorited: true,
                  });
                }}
              >
                <Star size={12} style={{ color: "var(--primary)" }} fill="var(--primary)" className="shrink-0" />
                <span className="truncate">{fav.icon ? `${fav.icon} ` : ""}{fav.title}</span>
              </div>
            ))}
          </div>
        )}



        {/* 페이지 트리 */}
        <div className="px-2 pb-2">
          <div className="flex items-center justify-between mb-1 px-1">
            <button
              onClick={() => toggleSection("pages")}
              className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--muted)", background: "transparent", border: "none", cursor: "pointer", padding: 0 }}
            >
              {sectionCollapse.pages ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
              페이지
            </button>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setSortMode(prev => prev === "manual" ? "name" : prev === "name" ? "updated" : "manual");
                }}
                className="p-0.5 rounded hover:opacity-70"
                title={`정렬: ${sortMode === "manual" ? "수동" : sortMode === "name" ? "이름순" : "수정일순"}`}
                aria-label={`정렬: ${sortMode === "manual" ? "수동" : sortMode === "name" ? "이름순" : "수정일순"}`}
                style={{ color: sortMode !== "manual" ? "var(--primary)" : "var(--muted)" }}
              >
                <ArrowUpDown size={12} />
              </button>
              {canManagePages && (
                <button
                  onClick={() => onCreatePage()}
                  className="p-0.5 rounded hover:opacity-70"
                  title="새 페이지"
                  aria-label="새 페이지"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
          </div>

        {!sectionCollapse.pages && pages.length > 10 && (
          <input
            value={pageFilter}
            onChange={(e) => setPageFilter(e.target.value)}
            placeholder="페이지 필터..."
            className="w-full px-2 py-1 rounded text-xs bg-transparent outline-none mb-1"
            style={{ border: "1px solid var(--border)" }}
          />
        )}

        {!sectionCollapse.pages && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={pages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <div role="tree" aria-label="페이지 트리">
            {rootPages.map((page) => (
              <SortablePageItem
                key={page.id}
                page={page}
                allPages={pages}
                selectedId={pageId}
                workspaceId={workspace.id}
                onCreatePage={onCreatePage}
                onDeletePage={onDeletePage}
                canManagePages={canManagePages}
                canDelete={canDelete}
                favoriteIds={favoriteIds}
                onContextMenu={handleContextMenu}
                dropTargetId={dropTargetId}
              />
            ))}
            </div>
          </SortableContext>
        </DndContext>
        )}

        {!sectionCollapse.pages && rootPages.length === 0 && (
          <p className="text-xs px-2 py-4 text-center" style={{ color: "var(--muted)" }}>
            페이지가 없습니다
          </p>
        )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-2 space-y-0.5" style={{ borderTop: "1px solid var(--border)" }}>
        {/* 도구: 가져오기 / 휴지통 / 설정 */}
        {canManagePages && (
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            <Upload size={14} />
            가져오기
          </button>
        )}
        {canManageTrash && (
          <button
            onClick={() => setShowTrash(true)}
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            <Trash2 size={14} />
            휴지통
            {trashCount > 0 && (
              <span
                className="text-[10px] px-1 py-0.5 rounded-full ml-auto"
                style={{ background: "var(--sidebar-hover)", color: "var(--foreground)" }}
              >
                {trashCount}
              </span>
            )}
          </button>
        )}
        <button
          onClick={() => router.push(`/workspace/${workspace.id}/user-settings`)}
          className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-sm hover:opacity-70"
          style={{ color: "var(--muted)" }}
        >
          <Settings size={14} />
          설정
        </button>

        {/* 프로필: 아바타 + 이름 + 로그아웃 + 피드백 */}
        <div
          className="flex items-center gap-2 px-2 py-1.5 rounded mt-1"
          style={{ background: "var(--sidebar-hover)" }}
        >
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
            style={{ background: "var(--primary)", color: "white" }}
          >
            {(session?.user?.name || session?.user?.email || "?").charAt(0).toUpperCase()}
          </div>
          <span
            className="flex-1 text-sm truncate"
            style={{ color: "var(--foreground)" }}
          >
            {session?.user?.name || session?.user?.email || "사용자"}
          </span>
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="p-1 rounded hover:opacity-70 shrink-0"
            style={{ color: "var(--muted)" }}
            title="로그아웃"
            aria-label="로그아웃"
          >
            <LogOut size={14} />
          </button>
          <button
            onClick={() => window.dispatchEvent(new Event("feedback:open"))}
            className="p-1 rounded hover:opacity-70 shrink-0"
            style={{ color: "var(--muted)" }}
            title="피드백 / 이슈 등록"
            aria-label="피드백"
          >
            <MessageSquarePlus size={14} />
          </button>
        </div>
      </div>

      </div>{/* end inner content wrapper */}

      {showTrash && (
        <TrashPanel
          workspaceId={workspace.id}
          onClose={() => setShowTrash(false)}
          onRestore={() => {
            onRefresh();
            fetchTrashCount();
          }}
        />
      )}

      {showImport && (
        <ImportModal
          workspaceId={workspace.id}
          onClose={() => setShowImport(false)}
          onImported={() => onRefresh()}
        />
      )}

      {/* Context menu */}
      {contextMenu && (
        <PageContextMenu
          menu={contextMenu}
          workspaceId={workspace.id}
          canManagePages={canManagePages}
          canDelete={canDelete}
          hasChildren={pages.some((p) => p.parentId === contextMenu.pageId)}
          allPages={pages}
          onCreatePage={onCreatePage}
          onDeletePage={onDeletePage}
          onRefresh={onRefresh}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Blank area context menu */}
      {blankContextMenu && (
        <BlankAreaContextMenu
          x={blankContextMenu.x}
          y={blankContextMenu.y}
          onCreatePage={() => { onCreatePage(); setBlankContextMenu(null); }}
          onImport={() => { setShowImport(true); setBlankContextMenu(null); }}
          onClose={() => setBlankContextMenu(null)}
        />
      )}

      {/* Resize handle */}
      {isOpen && (
        <div
          onMouseDown={handleResizeStart}
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize z-10 group"
          style={{ background: "transparent" }}
        >
          <div
            className="w-full h-full opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: "var(--primary)" }}
          />
        </div>
      )}
    </aside>
  );
}

// ── SortablePageItem ──────────────────────────────────────────

function SortablePageItem({
  page,
  allPages,
  selectedId,
  workspaceId,
  onCreatePage,
  onDeletePage,
  canManagePages,
  canDelete,
  favoriteIds,
  onContextMenu,
  dropTargetId,
  depth = 0,
}: {
  page: Page;
  allPages: Page[];
  selectedId?: string;
  workspaceId: string;
  onCreatePage: (parentId?: string) => void;
  onDeletePage: (pageId: string, title: string) => void;
  canManagePages: boolean;
  canDelete: boolean;
  favoriteIds: Set<string>;
  onContextMenu: (e: React.MouseEvent, page: Page) => void;
  dropTargetId?: string | null;
  depth?: number;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page.id, disabled: !canManagePages });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const children = allPages
    .filter((p) => p.parentId === page.id)
    .sort((a, b) => a.position - b.position);
  const isSelected = page.id === selectedId;
  const isDropTarget = dropTargetId === page.id;

  return (
    <div ref={setNodeRef} style={style}>
      <div
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={children.length > 0 ? expanded : undefined}
        tabIndex={0}
        className="flex items-center group rounded px-1 py-0.5 cursor-pointer text-sm"
        style={{
          paddingLeft: `${depth * 12 + 4}px`,
          background: isDropTarget ? "color-mix(in srgb, var(--primary) 15%, transparent)"
            : isSelected ? "var(--sidebar-hover)" : undefined,
          outline: isDropTarget ? "2px dashed var(--primary)" : undefined,
          outlineOffset: "-2px",
          borderRadius: "4px",
        }}
        onMouseEnter={(e) => {
          if (!isSelected) e.currentTarget.style.background = "var(--sidebar-hover)";
        }}
        onMouseLeave={(e) => {
          if (!isSelected) e.currentTarget.style.background = "transparent";
        }}
        onClick={() => router.push(`/workspace/${workspaceId}/page/${page.id}`)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            router.push(`/workspace/${workspaceId}/page/${page.id}`);
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            const allItems = Array.from(
              e.currentTarget.closest('[role="tree"]')?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []
            );
            const idx = allItems.indexOf(e.currentTarget);
            if (idx >= 0 && idx < allItems.length - 1) {
              allItems[idx + 1].focus();
            }
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            const allItems = Array.from(
              e.currentTarget.closest('[role="tree"]')?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? []
            );
            const idx = allItems.indexOf(e.currentTarget);
            if (idx > 0) {
              allItems[idx - 1].focus();
            }
          }
          if (e.key === "ArrowRight") {
            e.preventDefault();
            if (children.length > 0 && !expanded) {
              setExpanded(true);
            }
          }
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            if (children.length > 0 && expanded) {
              setExpanded(false);
            } else if (depth > 0) {
              // Move focus to parent treeitem
              const parentItem = e.currentTarget.parentElement?.closest('[role="treeitem"]');
              if (parentItem instanceof HTMLElement) {
                parentItem.focus();
              }
            }
          }
          if (e.key === "F10" && e.shiftKey) {
            e.preventDefault();
            const rect = e.currentTarget.getBoundingClientRect();
            onContextMenu(
              { clientX: rect.left, clientY: rect.bottom, preventDefault: () => {}, stopPropagation: () => {} } as unknown as React.MouseEvent,
              page
            );
          }
        }}
        onContextMenu={(e) => onContextMenu(e, page)}
      >
        {/* Drag handle */}
        {canManagePages ? (
          <span
            className="opacity-0 group-hover:opacity-100 cursor-grab p-0.5 shrink-0"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={10} />
          </span>
        ) : (
          <span className="w-3 shrink-0" />
        )}

        {children.length > 0 ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="p-0.5 shrink-0"
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className="w-0 shrink-0" />
        )}
        {page.icon ? (
          <span className="shrink-0 mr-1.5 text-sm">{page.icon}</span>
        ) : (
          <FileText size={14} className="shrink-0 mr-1.5" style={{ color: "var(--muted)" }} />
        )}
        <span className="truncate flex-1">{page.title}</span>

        {/* Hover actions: more menu + add subpage */}
        <span
          className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              onContextMenu(
                { ...e, clientX: e.currentTarget.getBoundingClientRect().right, clientY: e.currentTarget.getBoundingClientRect().top, preventDefault: () => {}, stopPropagation: () => {} } as unknown as React.MouseEvent,
                page
              );
            }}
            className="p-0.5 rounded hover:opacity-70"
            title="더보기"
            aria-label="더보기"
          >
            <MoreHorizontal size={12} />
          </button>
          {canManagePages && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCreatePage(page.id);
              }}
              className="p-0.5 rounded hover:opacity-70"
              title="하위 페이지 추가"
              aria-label="하위 페이지 추가"
            >
              <Plus size={12} />
            </button>
          )}
        </span>
      </div>
      {expanded &&
        children.map((child) => (
          <SortablePageItem
            key={child.id}
            page={child}
            allPages={allPages}
            selectedId={selectedId}
            workspaceId={workspaceId}
            onCreatePage={onCreatePage}
            onDeletePage={onDeletePage}
            canManagePages={canManagePages}
            canDelete={canDelete}
            favoriteIds={favoriteIds}
            onContextMenu={onContextMenu}
            dropTargetId={dropTargetId}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}
