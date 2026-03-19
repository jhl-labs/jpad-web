"use client";

import { useEffect, useState } from "react";
import { X, Keyboard } from "lucide-react";

const shortcuts = [
  { keys: ["Ctrl", "K"], description: "Quick Switcher (검색)" },
  { keys: ["Ctrl", "."], description: "AI 이어쓰기" },
  { keys: ["Ctrl", "Shift", "."], description: "AI 패널 열기" },
  { keys: ["Ctrl", "\\"], description: "집중 모드 (Zen Mode)" },
  { keys: ["Ctrl", "/"], description: "단축키 도움말" },
  { keys: ["Ctrl", "S"], description: "저장" },
  { keys: ["Ctrl", "Z"], description: "실행취소" },
  { keys: ["Ctrl", "Shift", "W"], description: "워크스페이스 전환" },
  { keys: ["/"], description: "슬래시 메뉴" },
  { keys: ["ESC"], description: "패널/모달 닫기" },
];

export function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ctrl+/ or ? (without modifier, not in input)
      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }
      if (
        e.key === "?" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target as HTMLElement)?.isContentEditable
      ) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      onClick={() => setOpen(false)}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Modal */}
      <div
        className="relative rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="키보드 단축키"
        style={{ background: "var(--background)", border: "1px solid var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <Keyboard size={18} style={{ color: "var(--primary)" }} />
            <h2 className="text-base font-semibold">키보드 단축키</h2>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-1 rounded hover:opacity-70"
          >
            <X size={16} />
          </button>
        </div>

        {/* Shortcuts grid */}
        <div className="px-5 py-4">
          <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 items-center">
            {shortcuts.map((shortcut) => (
              <div key={shortcut.description} className="contents">
                <div className="flex items-center gap-1">
                  {shortcut.keys.map((key, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && (
                        <span className="text-xs" style={{ color: "var(--muted)" }}>+</span>
                      )}
                      <kbd
                        className="inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded text-xs font-mono font-medium"
                        style={{
                          background: "var(--sidebar-bg)",
                          border: "1px solid var(--border)",
                          color: "var(--foreground)",
                          boxShadow: "0 1px 0 var(--border)",
                        }}
                      >
                        {key}
                      </kbd>
                    </span>
                  ))}
                </div>
                <span className="text-sm" style={{ color: "var(--foreground)" }}>
                  {shortcut.description}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 text-xs text-center"
          style={{ borderTop: "1px solid var(--border)", color: "var(--muted)" }}
        >
          <kbd
            className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded text-[10px] font-mono"
            style={{
              background: "var(--sidebar-bg)",
              border: "1px solid var(--border)",
            }}
          >
            ESC
          </kbd>
          {" "}를 눌러 닫기
          <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
            단축키 커스터마이징은 추후 지원 예정입니다
          </p>
        </div>
      </div>
    </div>
  );
}
