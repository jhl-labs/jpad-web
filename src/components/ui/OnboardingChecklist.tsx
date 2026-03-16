"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  FileText,
  Users,
  Keyboard,
  Sparkles,
  PartyPopper,
  X,
} from "lucide-react";

interface OnboardingChecklistProps {
  workspaceId: string;
  hasPages: boolean;
  onCreatePage: () => void;
}

interface ChecklistState {
  workspaceCreated: boolean;
  firstPage: boolean;
  inviteTeam: boolean;
  learnShortcuts: boolean;
  useAi: boolean;
  dismissed: boolean;
}

const INITIAL_STATE: ChecklistState = {
  workspaceCreated: true, // auto-completed
  firstPage: false,
  inviteTeam: false,
  learnShortcuts: false,
  useAi: false,
  dismissed: false,
};

function getStorageKey(workspaceId: string) {
  return `onboarding:${workspaceId}`;
}

function loadState(workspaceId: string): ChecklistState {
  try {
    const raw = localStorage.getItem(getStorageKey(workspaceId));
    if (raw) return { ...INITIAL_STATE, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return { ...INITIAL_STATE };
}

function saveState(workspaceId: string, state: ChecklistState) {
  try {
    localStorage.setItem(getStorageKey(workspaceId), JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function OnboardingChecklist({
  workspaceId,
  hasPages,
  onCreatePage,
}: OnboardingChecklistProps) {
  const router = useRouter();
  const [state, setState] = useState<ChecklistState>(INITIAL_STATE);
  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    const loaded = loadState(workspaceId);
    // Auto-complete firstPage if pages exist
    if (hasPages) {
      loaded.firstPage = true;
    }
    setState(loaded);
  }, [workspaceId, hasPages]);

  const persist = useCallback(
    (update: Partial<ChecklistState>) => {
      setState((prev) => {
        const next = { ...prev, ...update };
        saveState(workspaceId, next);
        return next;
      });
    },
    [workspaceId]
  );

  if (state.dismissed) return null;

  const items = [
    {
      key: "workspaceCreated" as const,
      label: "워크스페이스 생성",
      icon: <CheckCircle2 size={16} />,
      done: state.workspaceCreated,
      action: undefined,
    },
    {
      key: "firstPage" as const,
      label: "첫 페이지 만들기",
      icon: <FileText size={16} />,
      done: state.firstPage,
      action: () => {
        persist({ firstPage: true });
        onCreatePage();
      },
    },
    {
      key: "inviteTeam" as const,
      label: "팀원 초대하기",
      icon: <Users size={16} />,
      done: state.inviteTeam,
      action: () => {
        persist({ inviteTeam: true });
        router.push(`/workspace/${workspaceId}/settings?tab=members`);
      },
    },
    {
      key: "learnShortcuts" as const,
      label: "단축키 배우기",
      icon: <Keyboard size={16} />,
      done: state.learnShortcuts,
      action: () => {
        persist({ learnShortcuts: true });
        setShowShortcuts(true);
      },
    },
    {
      key: "useAi" as const,
      label: "AI 기능 사용하기",
      icon: <Sparkles size={16} />,
      done: state.useAi,
      action: () => {
        persist({ useAi: true });
        // Navigate to most recent page (or create one) then open AI panel
        if (hasPages) {
          // The workspace home should navigate; we dispatch an event
          window.dispatchEvent(new Event("onboarding:open-ai"));
        } else {
          onCreatePage();
        }
      },
    },
  ];

  const completedCount = items.filter((i) => i.done).length;
  const totalCount = items.length;
  const allCompleted = completedCount === totalCount;
  const progressPct = (completedCount / totalCount) * 100;

  return (
    <>
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: "var(--background)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold">
              {allCompleted ? "설정 완료!" : "시작 가이드"}
            </h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              {allCompleted
                ? "모든 항목을 완료했습니다."
                : `${completedCount}/${totalCount} 완료`}
            </p>
          </div>
          {allCompleted && (
            <PartyPopper size={24} style={{ color: "var(--primary)" }} />
          )}
        </div>

        {/* Progress bar */}
        <div className="px-5 pb-3">
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ background: "var(--sidebar-hover)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                background: "var(--primary)",
                width: `${progressPct}%`,
              }}
            />
          </div>
        </div>

        {/* Checklist items */}
        {!allCompleted && (
          <div className="px-5 pb-4 space-y-1">
            {items.map((item) => (
              <button
                key={item.key}
                onClick={item.action}
                disabled={item.done || !item.action}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm text-left transition-colors"
                style={{
                  opacity: item.done ? 0.6 : 1,
                  cursor: item.done || !item.action ? "default" : "pointer",
                }}
                onMouseEnter={(e) => {
                  if (!item.done && item.action) {
                    e.currentTarget.style.background = "var(--sidebar-hover)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <span
                  className="shrink-0"
                  style={{ color: item.done ? "#22c55e" : "var(--muted)" }}
                >
                  {item.done ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <Circle size={18} />
                  )}
                </span>
                <span
                  className="shrink-0"
                  style={{ color: item.done ? "var(--muted)" : "var(--primary)" }}
                >
                  {item.icon}
                </span>
                <span
                  style={{
                    textDecoration: item.done ? "line-through" : "none",
                    color: item.done ? "var(--muted)" : "var(--foreground)",
                  }}
                >
                  {item.label}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Dismiss / hide */}
        <div
          className="px-5 py-3 flex justify-end"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button
            onClick={() => persist({ dismissed: true })}
            className="text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-70"
            style={{ color: "var(--muted)", background: "var(--sidebar-hover)" }}
          >
            {allCompleted ? "체크리스트 숨기기" : "나중에 하기"}
          </button>
        </div>
      </div>

      {/* Keyboard Shortcuts Modal */}
      {showShortcuts && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowShortcuts(false);
          }}
        >
          <div
            className="rounded-xl shadow-2xl w-full max-w-md mx-4"
            style={{
              background: "var(--background)",
              border: "1px solid var(--border)",
            }}
          >
            <div
              className="flex items-center justify-between px-5 py-4"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <h3 className="text-lg font-semibold">키보드 단축키</h3>
              <button
                onClick={() => setShowShortcuts(false)}
                className="p-1 rounded hover:opacity-70"
                style={{ color: "var(--muted)" }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              {[
                { keys: "Ctrl + K", desc: "빠른 검색 / 페이지 전환" },
                { keys: "Ctrl + N", desc: "새 페이지 만들기" },
                { keys: "Ctrl + S", desc: "저장" },
                { keys: "Ctrl + Shift + A", desc: "AI 패널 열기" },
                { keys: "Ctrl + B", desc: "굵게" },
                { keys: "Ctrl + I", desc: "기울임" },
                { keys: "Ctrl + /", desc: "슬래시 명령어" },
                { keys: "Tab", desc: "들여쓰기" },
                { keys: "Shift + Tab", desc: "내어쓰기" },
              ].map((shortcut) => (
                <div
                  key={shortcut.keys}
                  className="flex items-center justify-between text-sm"
                >
                  <span style={{ color: "var(--foreground)" }}>
                    {shortcut.desc}
                  </span>
                  <kbd
                    className="px-2 py-0.5 rounded text-xs font-mono"
                    style={{
                      background: "var(--sidebar-hover)",
                      border: "1px solid var(--border)",
                      color: "var(--muted)",
                    }}
                  >
                    {shortcut.keys}
                  </kbd>
                </div>
              ))}
            </div>
            <div
              className="px-5 py-3 flex justify-end"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <button
                onClick={() => setShowShortcuts(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-80"
                style={{ background: "var(--primary)" }}
              >
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
