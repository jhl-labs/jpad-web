"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useCreateBlockNote, SuggestionMenuController } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import "@blocknote/mantine/style.css";
import {
  getDefaultSlashMenuItems,
  filterSuggestionItems,
} from "@blocknote/core/extensions";
import type { BlockNoteEditor } from "@blocknote/core";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { blocksToMarkdown } from "@/lib/markdown/serializer";
import { Sparkles, FileText, Expand, Languages, SpellCheck } from "lucide-react";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface CursorContext {
  blockId: string;
  textBefore: string; // markdown of blocks up to and including cursor block
}

interface CollaborativeEditorProps {
  pageId: string;
  workspaceId: string;
  initialContent: string;
  readOnly: boolean;
  resetVersion?: number;
  pendingInsertMarkdown?: {
    key: number;
    markdown: string;
    afterBlockId?: string; // insert after this block instead of at end
  } | null;
  onSave: (markdown: string) => Promise<void>;
  onSaveStatusChange?: (status: SaveStatus) => void;
  onRemoteTitleChange?: (title: string) => void;
  onCursorContextChange?: (context: CursorContext | null) => void;
  title?: string;
}

async function fetchWsToken(
  workspaceId: string,
  pageId: string
): Promise<string | null> {
  try {
    const res = await fetch("/api/ws-token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, pageId }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.token;
  } catch {
    return null;
  }
}

interface CollaborationState {
  doc: Y.Doc;
  provider: WebsocketProvider | null;
}

// ---------------------------------------------------------------------------
// Slash menu: AI commands + useful block shortcuts
// ---------------------------------------------------------------------------

function getCustomSlashMenuItems(editor: BlockNoteEditor) {
  const defaults = getDefaultSlashMenuItems(editor);

  const aiItems = [
    {
      title: "AI 이어쓰기",
      subtext: "커서 위치에서 자연스럽게 이어 씁니다",
      group: "AI",
      onItemClick: () => {
        window.dispatchEvent(new CustomEvent("ai:autocomplete"));
      },
    },
    {
      title: "AI 요약",
      subtext: "문서 내용을 핵심만 요약합니다",
      group: "AI",
      onItemClick: () => {
        window.dispatchEvent(new CustomEvent("ai:action", { detail: { action: "summarize" } }));
      },
    },
    {
      title: "AI 확장",
      subtext: "내용을 더 상세하게 보강합니다",
      group: "AI",
      onItemClick: () => {
        window.dispatchEvent(new CustomEvent("ai:action", { detail: { action: "expand" } }));
      },
    },
    {
      title: "AI 문법 교정",
      subtext: "맞춤법과 문법을 교정합니다",
      group: "AI",
      onItemClick: () => {
        window.dispatchEvent(new CustomEvent("ai:action", { detail: { action: "fixGrammar" } }));
      },
    },
    {
      title: "AI 번역 (영어)",
      subtext: "영어로 번역합니다",
      group: "AI",
      onItemClick: () => {
        window.dispatchEvent(new CustomEvent("ai:action", { detail: { action: "translate" } }));
      },
    },
    {
      title: "AI 톤 변경",
      subtext: "격식체/친근한/전문적 톤으로 변경",
      group: "AI",
      onItemClick: () => {
        window.dispatchEvent(new CustomEvent("ai:action", { detail: { action: "changeTone" } }));
      },
    },
    {
      title: "AI 액션 아이템",
      subtext: "할 일 목록을 추출합니다",
      group: "AI",
      onItemClick: () => {
        window.dispatchEvent(new CustomEvent("ai:action", { detail: { action: "actionItems" } }));
      },
    },
  ];

  const utilItems = [
    {
      title: "구분선",
      subtext: "가로 구분선을 삽입합니다",
      group: "기본 블록",
      onItemClick: () => {
        const cursor = editor.getTextCursorPosition();
        if (cursor?.block) {
          editor.insertBlocks(
            [{ type: "paragraph", content: [{ type: "text", text: "---", styles: {} }] }],
            cursor.block,
            "after"
          );
        }
      },
    },
    {
      title: "콜아웃",
      subtext: "강조 박스를 삽입합니다",
      group: "기본 블록",
      onItemClick: () => {
        const cursor = editor.getTextCursorPosition();
        if (cursor?.block) {
          editor.insertBlocks(
            [{ type: "paragraph", content: [{ type: "text", text: "💡 ", styles: {} }] }],
            cursor.block,
            "after"
          );
        }
      },
    },
    {
      title: "현재 날짜",
      subtext: "오늘 날짜를 삽입합니다",
      group: "삽입",
      onItemClick: () => {
        const today = new Date().toLocaleDateString("ko-KR", {
          year: "numeric",
          month: "long",
          day: "numeric",
          weekday: "long",
        });
        editor.insertInlineContent([{ type: "text", text: today, styles: {} }]);
      },
    },
    {
      title: "현재 시간",
      subtext: "현재 시간을 삽입합니다",
      group: "삽입",
      onItemClick: () => {
        const now = new Date().toLocaleString("ko-KR", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        editor.insertInlineContent([{ type: "text", text: now, styles: {} }]);
      },
    },
  ];

  return [...aiItems, ...utilItems, ...defaults];
}

/**
 * Inner editor that only mounts once collaboration is ready.
 * This guarantees useCreateBlockNote receives the Yjs fragment on first render.
 */
function InnerEditor({
  collaboration,
  initialContent,
  readOnly,
  resetVersion,
  pendingInsertMarkdown,
  onSave,
  onSaveStatusChange,
  onCursorContextChange,
}: {
  collaboration: CollaborationState;
  initialContent: string;
  readOnly: boolean;
  resetVersion: number;
  pendingInsertMarkdown: CollaborativeEditorProps["pendingInsertMarkdown"];
  onSave: (markdown: string) => Promise<void>;
  onSaveStatusChange?: (status: SaveStatus) => void;
  onCursorContextChange?: (context: CursorContext | null) => void;
}) {
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [connected, setConnected] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const initialLoaded = useRef(false);
  const synced = useRef(false);
  const lastInsertedKey = useRef<number | null>(null);

  // 리렌더 시 색상 변경을 방지하기 위해 useRef에 저장
  const userColorRef = useRef(
    "#" +
    Math.floor(Math.random() * 0xffffff)
      .toString(16)
      .padStart(6, "0")
  );

  const updateSaveStatus = useCallback(
    (status: SaveStatus) => {
      setSaveStatus(status);
      onSaveStatusChange?.(status);
    },
    [onSaveStatusChange]
  );

  const editor = useCreateBlockNote({
    collaboration: {
      provider: collaboration.provider ?? undefined,
      fragment: collaboration.doc.getXmlFragment("blocknote"),
      user: {
        name: "사용자",
        color: userColorRef.current,
      },
    },
    domAttributes: {
      editor: {
        style: "padding: 0; font-size: 16px; line-height: 1.6;",
      },
    },
  });

  // Track connection status
  useEffect(() => {
    setConnected(false);
    const prov = collaboration.provider;
    if (!prov) return;

    const onStatus = ({ status }: { status: string }) => {
      setConnected(status === "connected");
    };
    prov.on("status", onStatus);

    if (prov.wsconnected) setConnected(true);

    return () => {
      prov.off("status", onStatus);
    };
  }, [collaboration]);

  // Load initial content once Yjs sync completes
  useEffect(() => {
    if (!editor || !initialContent || initialLoaded.current) return;

    const prov = collaboration.provider;

    async function loadIfEmpty() {
      if (initialLoaded.current) return;
      initialLoaded.current = true;
      const fragment = collaboration.doc.getXmlFragment("blocknote");
      if (fragment.length === 0) {
        try {
          const blocks = await editor.tryParseMarkdownToBlocks(initialContent);
          editor.replaceBlocks(editor.document, blocks);
        } catch {
          // ignore parse errors
        }
      }
    }

    if (!prov || synced.current) {
      loadIfEmpty();
      return;
    }

    const onSync = (isSynced: boolean) => {
      if (isSynced) {
        synced.current = true;
        prov.off("sync", onSync);
        loadIfEmpty();
      }
    };

    if (prov.synced) {
      synced.current = true;
      loadIfEmpty();
      return;
    }

    prov.on("sync", onSync);

    const fallback = setTimeout(() => {
      prov.off("sync", onSync);
      loadIfEmpty();
    }, 3000);

    return () => {
      clearTimeout(fallback);
      prov.off("sync", onSync);
    };
  }, [editor, initialContent, collaboration]);

  // Apply explicit content resets such as version restore
  useEffect(() => {
    if (!editor || resetVersion === 0) return;

    let cancelled = false;

    async function resetDocument() {
      try {
        const blocks = await editor.tryParseMarkdownToBlocks(initialContent);
        if (!cancelled) {
          editor.replaceBlocks(editor.document, blocks);
        }
      } catch {
        // ignore parse errors on restore
      }
    }

    resetDocument();

    return () => {
      cancelled = true;
    };
  }, [editor, initialContent, resetVersion]);

  // Auto-save with debounce
  const handleChange = useCallback(() => {
    if (readOnly) return;

    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    if (savedTimeout.current) clearTimeout(savedTimeout.current);

    saveTimeout.current = setTimeout(async () => {
      if (!editor) return;
      updateSaveStatus("saving");
      try {
        const markdown = blocksToMarkdown(editor.document);
        await onSave(markdown);
        updateSaveStatus("saved");
        savedTimeout.current = setTimeout(() => updateSaveStatus("idle"), 2000);
      } catch {
        updateSaveStatus("error");
      }
    }, 2000);
  }, [editor, onSave, readOnly, updateSaveStatus]);

  // Keyboard shortcut: Ctrl+J or Cmd+J to trigger AI autocomplete
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "j") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("ai:autocomplete"));
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "j") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("ai:open-panel"));
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // Track cursor position and emit context for AI autocomplete
  const handleCursorChange = useCallback(() => {
    if (!editor || !onCursorContextChange) return;
    try {
      const cursor = editor.getTextCursorPosition();
      if (!cursor?.block) {
        onCursorContextChange(null);
        return;
      }
      const cursorBlockId = cursor.block.id;
      // Collect markdown for all blocks up to and including cursor block
      const allBlocks = editor.document;
      const idx = allBlocks.findIndex((b) => b.id === cursorBlockId);
      if (idx < 0) {
        onCursorContextChange(null);
        return;
      }
      const blocksUpToCursor = allBlocks.slice(0, idx + 1);
      const textBefore = blocksToMarkdown(blocksUpToCursor);
      onCursorContextChange({ blockId: cursorBlockId, textBefore });
    } catch {
      onCursorContextChange(null);
    }
  }, [editor, onCursorContextChange]);

  // Insert pending markdown
  useEffect(() => {
    if (
      !editor ||
      readOnly ||
      !pendingInsertMarkdown ||
      pendingInsertMarkdown.key === lastInsertedKey.current
    ) {
      return;
    }

    let cancelled = false;
    const insertRequest = pendingInsertMarkdown;
    lastInsertedKey.current = insertRequest.key;

    async function insertMarkdown() {
      try {
        const blocks = await Promise.resolve(
          editor.tryParseMarkdownToBlocks(insertRequest.markdown)
        );
        if (cancelled || blocks.length === 0) return;

        // Insert after specific block (cursor position) or at end
        const targetBlockId = insertRequest.afterBlockId;
        const targetBlock = targetBlockId
          ? editor.document.find((b) => b.id === targetBlockId)
          : null;
        const anchorBlock = targetBlock || editor.document.at(-1);

        if (anchorBlock) {
          editor.insertBlocks(blocks, anchorBlock, "after");
        } else {
          editor.replaceBlocks(editor.document, blocks);
        }
        handleChange();
      } catch {
        // ignore insert failures
      }
    }

    insertMarkdown();

    return () => {
      cancelled = true;
    };
  }, [editor, handleChange, pendingInsertMarkdown, readOnly]);

  // Dark mode detection
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    setTheme(mql.matches ? "dark" : "light");

    const handler = (e: MediaQueryListEvent) => {
      setTheme(e.matches ? "dark" : "light");
    };
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Floating AI toolbar on text selection
  const [selectedText, setSelectedText] = useState("");
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (
        !sel ||
        sel.isCollapsed ||
        !sel.anchorNode ||
        !editorContainerRef.current?.contains(sel.anchorNode)
      ) {
        setSelectedText("");
        setSelectionRect(null);
        return;
      }
      const text = sel.toString().trim();
      if (text.length < 2) {
        setSelectedText("");
        setSelectionRect(null);
        return;
      }
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelectedText(text);
      setSelectionRect(rect);
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  const handleFloatingAiAction = useCallback(
    (action: string) => {
      // Set inputText on AiPanel via custom event
      window.dispatchEvent(
        new CustomEvent("ai:inline-action", {
          detail: { action, text: selectedText },
        })
      );
      // Clear selection
      window.getSelection()?.removeAllRanges();
      setSelectedText("");
      setSelectionRect(null);
    },
    [selectedText]
  );

  const floatingAiActions = [
    { label: "AI 요약", action: "summarize", icon: <FileText size={13} /> },
    { label: "AI 확장", action: "expand", icon: <Expand size={13} /> },
    { label: "AI 번역", action: "translate", icon: <Languages size={13} /> },
    { label: "AI 교정", action: "fixGrammar", icon: <SpellCheck size={13} /> },
  ];

  // Right-click context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly) return;
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY });
    },
    [readOnly]
  );

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  const contextActions = [
    {
      group: "편집",
      items: [
        {
          label: "잘라내기",
          shortcut: "Ctrl+X",
          action: () => document.execCommand("cut"),
        },
        {
          label: "복사",
          shortcut: "Ctrl+C",
          action: () => document.execCommand("copy"),
        },
        {
          label: "붙여넣기",
          shortcut: "Ctrl+V",
          action: () => navigator.clipboard.readText().then((t) => editor.insertInlineContent([{ type: "text", text: t, styles: {} }])).catch(() => {}),
        },
        {
          label: "블록 삭제",
          shortcut: "",
          action: () => {
            const cursor = editor.getTextCursorPosition();
            if (cursor?.block) editor.removeBlocks([cursor.block]);
          },
        },
        {
          label: "블록 복제",
          shortcut: "",
          action: () => {
            const cursor = editor.getTextCursorPosition();
            if (cursor?.block) {
              editor.insertBlocks([cursor.block], cursor.block, "after");
            }
          },
        },
      ],
    },
    {
      group: "변환",
      items: [
        {
          label: "제목 1로 변환",
          shortcut: "",
          action: () => {
            const cursor = editor.getTextCursorPosition();
            if (cursor?.block) editor.updateBlock(cursor.block, { type: "heading", props: { level: 1 } as Record<string, unknown> });
          },
        },
        {
          label: "제목 2로 변환",
          shortcut: "",
          action: () => {
            const cursor = editor.getTextCursorPosition();
            if (cursor?.block) editor.updateBlock(cursor.block, { type: "heading", props: { level: 2 } as Record<string, unknown> });
          },
        },
        {
          label: "글머리 목록으로 변환",
          shortcut: "",
          action: () => {
            const cursor = editor.getTextCursorPosition();
            if (cursor?.block) editor.updateBlock(cursor.block, { type: "bulletListItem" });
          },
        },
        {
          label: "번호 목록으로 변환",
          shortcut: "",
          action: () => {
            const cursor = editor.getTextCursorPosition();
            if (cursor?.block) editor.updateBlock(cursor.block, { type: "numberedListItem" });
          },
        },
        {
          label: "본문으로 변환",
          shortcut: "",
          action: () => {
            const cursor = editor.getTextCursorPosition();
            if (cursor?.block) editor.updateBlock(cursor.block, { type: "paragraph" });
          },
        },
      ],
    },
    {
      group: "AI",
      items: [
        {
          label: "AI 이어쓰기",
          shortcut: "Ctrl+J",
          action: () => window.dispatchEvent(new CustomEvent("ai:autocomplete")),
        },
        {
          label: "AI 요약",
          shortcut: "",
          action: () => window.dispatchEvent(new CustomEvent("ai:action", { detail: { action: "summarize" } })),
        },
        {
          label: "AI 확장",
          shortcut: "",
          action: () => window.dispatchEvent(new CustomEvent("ai:action", { detail: { action: "expand" } })),
        },
        {
          label: "AI 문법 교정",
          shortcut: "",
          action: () => window.dispatchEvent(new CustomEvent("ai:action", { detail: { action: "fixGrammar" } })),
        },
      ],
    },
  ];

  return (
    <div className="relative" onContextMenu={handleContextMenu} ref={editorContainerRef}>
      {/* Floating AI toolbar on text selection */}
      {selectedText && selectionRect && (
        <div
          className="fixed z-[60] flex items-center gap-0.5 px-1 py-0.5 rounded-full shadow-lg"
          style={{
            left: selectionRect.left + selectionRect.width / 2,
            top: selectionRect.top - 44,
            transform: "translateX(-50%)",
            background: "var(--background)",
            border: "1px solid var(--border)",
            backdropFilter: "blur(12px)",
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <Sparkles size={13} style={{ color: "var(--primary)", marginLeft: 6, marginRight: 2 }} />
          {floatingAiActions.map((item) => (
            <button
              key={item.action}
              onClick={() => handleFloatingAiAction(item.action)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap hover:bg-black/5 dark:hover:bg-white/10"
              style={{ color: "var(--foreground)" }}
              title={item.label}
            >
              {item.icon}
              <span className="hidden sm:inline">{item.label.replace("AI ", "")}</span>
            </button>
          ))}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          role="menu"
          className="fixed z-50 py-1 rounded-lg shadow-lg min-w-[200px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            background: "var(--background)",
            border: "1px solid var(--border)",
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setContextMenu(null);
              return;
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const items = contextMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
              if (!items || items.length === 0) return;
              const current = document.activeElement as HTMLElement;
              const idx = Array.from(items).indexOf(current as HTMLButtonElement);
              let next: number;
              if (e.key === "ArrowDown") {
                next = idx < 0 ? 0 : (idx + 1) % items.length;
              } else {
                next = idx <= 0 ? items.length - 1 : idx - 1;
              }
              items[next].focus();
            }
          }}
        >
          {contextActions.map((group, gi) => (
            <div key={group.group}>
              {gi > 0 && (
                <div className="my-1" style={{ borderTop: "1px solid var(--border)" }} />
              )}
              <div
                className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--muted)" }}
              >
                {group.group}
              </div>
              {group.items.map((item) => (
                <button
                  key={item.label}
                  role="menuitem"
                  className="w-full flex items-center justify-between px-3 py-1.5 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                  style={{ color: "var(--foreground)" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setContextMenu(null);
                    item.action();
                  }}
                >
                  <span>{item.label}</span>
                  {item.shortcut && (
                    <span className="text-[10px] ml-4" style={{ color: "var(--muted)" }}>
                      {item.shortcut}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div
        className="absolute top-0 right-0 flex items-center gap-2 text-xs z-10"
        style={{ color: "var(--muted)" }}
      >
        {saveStatus === "saving" && <span>저장 중...</span>}
        {saveStatus === "saved" && (
          <span style={{ color: "#22c55e" }}>저장됨</span>
        )}
        {saveStatus === "error" && (
          <span className="flex items-center gap-1.5" style={{ color: "#ef4444" }}>
            저장 실패
            <button
              onClick={handleChange}
              className="px-2 py-0.5 rounded text-[11px] font-medium transition-opacity hover:opacity-80"
              style={{
                background: "#ef4444",
                color: "white",
              }}
            >
              재시도
            </button>
          </span>
        )}
        <div
          className="w-2 h-2 rounded-full"
          role="status"
          aria-label={connected ? "실시간 연결됨" : "연결 끊김"}
          style={{ background: connected ? "#22c55e" : "#ef4444" }}
          title={connected ? "실시간 연결됨" : "연결 끊김"}
        />
        <span className="text-[10px]" style={{ color: "var(--muted)" }}>
          {connected ? "동기화" : "오프라인"}
        </span>
      </div>
      <BlockNoteView
        editor={editor}
        editable={!readOnly}
        onChange={() => { handleChange(); handleCursorChange(); }}
        theme={theme}
        slashMenu={false}
      >
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(getCustomSlashMenuItems(editor), query)
          }
        />
      </BlockNoteView>
    </div>
  );
}

export function CollaborativeEditor({
  pageId,
  workspaceId,
  initialContent,
  readOnly,
  resetVersion = 0,
  pendingInsertMarkdown = null,
  onSave,
  onSaveStatusChange,
  onRemoteTitleChange,
  onCursorContextChange,
  title,
}: CollaborativeEditorProps) {
  const [collaboration, setCollaboration] = useState<CollaborationState | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    const doc = new Y.Doc();
    const roomName = `${workspaceId}:${pageId}`;

    async function connect() {
      const token = await fetchWsToken(workspaceId, pageId);

      if (cancelled) {
        doc.destroy();
        return;
      }

      let wsProvider: WebsocketProvider | null = null;
      if (token) {
        try {
          wsProvider = new WebsocketProvider(
            process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:1234",
            roomName,
            doc,
            {
              connect: true,
              params: { token },
            }
          );
        } catch {
          // WS not available
        }
      }

      if (!cancelled) {
        setCollaboration({ doc, provider: wsProvider });
      }
    }

    connect();

    return () => {
      cancelled = true;
      setCollaboration((prev) => {
        if (prev) {
          prev.provider?.destroy();
          prev.doc.destroy();
        }
        return null;
      });
    };
  }, [pageId, workspaceId]);

  // Sync title via Yjs shared map
  useEffect(() => {
    if (!collaboration || !onRemoteTitleChange) return;
    const meta = collaboration.doc.getMap("pageMeta");

    const observer = () => {
      const remoteTitle = meta.get("title");
      if (typeof remoteTitle === "string") {
        onRemoteTitleChange(remoteTitle);
      }
    };
    meta.observe(observer);
    return () => { meta.unobserve(observer); };
  }, [collaboration, onRemoteTitleChange]);

  // Push local title changes to Yjs shared map
  useEffect(() => {
    if (!collaboration || title === undefined) return;
    const meta = collaboration.doc.getMap("pageMeta");
    const current = meta.get("title");
    if (current !== title) {
      meta.set("title", title);
    }
  }, [collaboration, title]);

  if (!collaboration) {
    return <div className="p-4" style={{ color: "var(--muted)" }}>연결 중...</div>;
  }

  return (
    <InnerEditor
      key={`${workspaceId}:${pageId}`}
      collaboration={collaboration}
      initialContent={initialContent}
      readOnly={readOnly}
      resetVersion={resetVersion}
      pendingInsertMarkdown={pendingInsertMarkdown}
      onSave={onSave}
      onSaveStatusChange={onSaveStatusChange}
      onCursorContextChange={onCursorContextChange}
    />
  );
}
