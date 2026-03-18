"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  X,
  Sparkles,
  Send,
  Copy,
  Check,
  Loader2,
  Bot,
  User,
  ChevronRight,
  FileText,
  Expand,
  Languages,
  SpellCheck,
  Palette,
  Lightbulb,
  ListChecks,
  ArrowDownToLine,
  RotateCcw,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { parseSSEStream } from "@/lib/sseUtils";

interface AiPanelProps {
  workspaceId: string;
  pageId: string;
  pageContent: string;
  isOpen: boolean;
  onClose: () => void;
  onInsertText: (text: string) => void;
}

type WritingAction =
  | "autocomplete"
  | "summarize"
  | "expand"
  | "translate"
  | "fixGrammar"
  | "changeTone"
  | "explain"
  | "actionItems";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ActionDef {
  action: WritingAction;
  label: string;
  description: string;
  icon: React.ReactNode;
  options?: { label: string; value: string }[];
  optionKey?: "targetLang" | "tone";
}

const ACTION_GROUPS: { title: string; actions: ActionDef[] }[] = [
  {
    title: "작성",
    actions: [
      {
        action: "autocomplete",
        label: "이어쓰기",
        description: "문서를 자연스럽게 이어 작성",
        icon: <WandSparkles size={15} />,
      },
      {
        action: "summarize",
        label: "요약",
        description: "핵심 포인트만 추출",
        icon: <FileText size={15} />,
      },
      {
        action: "expand",
        label: "확장",
        description: "더 상세하게 보강",
        icon: <Expand size={15} />,
      },
      {
        action: "explain",
        label: "쉽게 풀기",
        description: "누구나 이해하도록",
        icon: <Lightbulb size={15} />,
      },
    ],
  },
  {
    title: "교정",
    actions: [
      {
        action: "fixGrammar",
        label: "문법 교정",
        description: "맞춤법·문법 수정",
        icon: <SpellCheck size={15} />,
      },
      {
        action: "changeTone",
        label: "톤 변경",
        description: "문체를 바꿔서 작성",
        icon: <Palette size={15} />,
        options: [
          { label: "격식체", value: "격식체" },
          { label: "친근한", value: "친근한" },
          { label: "전문적", value: "전문적" },
        ],
        optionKey: "tone",
      },
    ],
  },
  {
    title: "추출",
    actions: [
      {
        action: "translate",
        label: "번역",
        description: "다른 언어로 변환",
        icon: <Languages size={15} />,
        options: [
          { label: "영어", value: "영어" },
          { label: "일본어", value: "일본어" },
          { label: "중국어", value: "중국어" },
          { label: "한국어", value: "한국어" },
        ],
        optionKey: "targetLang",
      },
      {
        action: "actionItems",
        label: "액션 아이템",
        description: "할 일 목록 추출",
        icon: <ListChecks size={15} />,
      },
    ],
  },
];

export function AiPanel({
  workspaceId,
  pageId,
  pageContent,
  isOpen,
  onClose,
  onInsertText,
}: AiPanelProps) {
  const [activeTab, setActiveTab] = useState<"write" | "chat">("write");

  // Writing assistant state
  const [inputText, setInputText] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeAction, setActiveAction] = useState<WritingAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [optionValues, setOptionValues] = useState<Record<string, string>>({
    targetLang: "영어",
    tone: "격식체",
  });
  const [expandedAction, setExpandedAction] = useState<WritingAction | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [streamingDone, setStreamingDone] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const lastActionRef = useRef<WritingAction | null>(null);

  // Chat state
  const chatStorageKey = useMemo(() => `ai-chat:${pageId}`, [pageId]);
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = sessionStorage.getItem(`ai-chat:${pageId}`);
      return stored ? JSON.parse(stored) : [];
    } catch (_error) {
      return [];
    }
  });
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [usePageContext, setUsePageContext] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dbHistoryLoaded = useRef(false);

  // Persist chat messages to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem(chatStorageKey, JSON.stringify(messages));
    } catch (_error) {
      // ignore storage errors
    }
  }, [messages, chatStorageKey]);

  // Load chat history: DB 우선, sessionStorage fallback
  useEffect(() => {
    // 페이지가 바뀔 때 DB에서 히스토리를 가져와서 로드
    dbHistoryLoaded.current = false;
    let cancelled = false;

    async function loadFromDb() {
      try {
        const res = await fetch(
          `/api/ai/chat/history?workspaceId=${workspaceId}&pageId=${pageId}`
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          const dbMessages: ChatMessage[] = (data.messages || []).map(
            (m: { role: string; content: string }) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
            })
          );
          if (dbMessages.length > 0) {
            setMessages(dbMessages);
            dbHistoryLoaded.current = true;
            return;
          }
        }
      } catch (_error) {
        // DB 실패 시 sessionStorage fallback
      }

      // DB에 히스토리가 없으면 sessionStorage에서 로드
      if (!cancelled) {
        try {
          const stored = sessionStorage.getItem(chatStorageKey);
          if (stored) {
            setMessages(JSON.parse(stored));
          } else {
            setMessages([]);
          }
        } catch (_error) {
          setMessages([]);
        }
      }
    }

    loadFromDb();

    return () => {
      cancelled = true;
    };
  }, [chatStorageKey, pageId, workspaceId]);

  const handleClearChat = useCallback(() => {
    setMessages([]);
    try {
      sessionStorage.removeItem(chatStorageKey);
    } catch (_error) {
      // ignore
    }
  }, [chatStorageKey]);

  useEffect(() => {
    if (isOpen && !inputText) {
      setInputText(pageContent);
    }
  }, [isOpen, pageContent, inputText]);

  // 패널 열릴 때 첫 포커스 가능한 요소에 포커스
  useEffect(() => {
    if (isOpen && panelRef.current) {
      const firstFocusable = panelRef.current.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }
  }, [isOpen]);

  // ESC로 닫기
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  // Auto-scroll result as it streams in
  useEffect(() => {
    if (loading && resultRef.current) {
      resultRef.current.scrollTop = resultRef.current.scrollHeight;
    }
  }, [result, loading]);

  const handleWriteAction = useCallback(
    async (action: WritingAction, optionOverride?: Record<string, string>) => {
      setLoading(true);
      setActiveAction(action);
      lastActionRef.current = action;
      setError(null);
      setResult("");
      setStreamingDone(false);
      setExpandedAction(null);

      const effectiveOptions = { ...optionValues, ...optionOverride };

      // 이어쓰기는 별도 API 사용
      if (action === "autocomplete") {
        try {
          const res = await fetch("/api/ai/autocomplete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspaceId,
              pageId,
              text: inputText || pageContent,
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error((data as { error?: string }).error || "이어쓰기에 실패했습니다");
          }
          // SSE 스트리밍 읽기
          const reader = res.body?.getReader();
          if (!reader) throw new Error("스트리밍 미지원");
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
                  setResult(accumulated);
                }
              } catch { /* skip */ }
            }
          }
          if (!accumulated.trim()) throw new Error("비어 있는 응답");
          setResult(accumulated);
          setStreamingDone(true);
          setLoading(false);
          return;
        } catch (err) {
          setError(err instanceof Error ? err.message : "이어쓰기 실패");
          setLoading(false);
          setStreamingDone(true);
          return;
        }
      }

      const body: Record<string, unknown> = {
        action,
        text: inputText || pageContent,
        pageId,
        workspaceId,
      };

      if (action === "translate") {
        body.options = { targetLang: effectiveOptions.targetLang };
      }
      if (action === "changeTone") {
        body.options = { tone: effectiveOptions.tone };
      }

      try {
        const res = await fetch("/api/ai/write", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
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
          throw new Error(errMsg || "AI 요청에 실패했습니다");
        }

        if (res.headers.get("content-type")?.includes("text/event-stream")) {
          let accumulated = "";
          for await (const text of parseSSEStream(res)) {
            accumulated += text;
            setResult(accumulated);
          }
        } else {
          const data = await res.json();
          setResult(data.result || data.text || "");
        }
        setStreamingDone(true);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          setError("요청 시간이 초과되었습니다.");
        } else {
          setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다");
        }
      } finally {
        setLoading(false);
        setActiveAction(null);
      }
    },
    [inputText, pageContent, pageId, workspaceId, optionValues]
  );

  // Listen for slash command AI actions
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action: string } | undefined;
      if (detail?.action && isOpen) {
        setActiveTab("write");
        handleWriteAction(detail.action as WritingAction);
      }
    };
    window.addEventListener("ai:execute-action", handler);
    return () => window.removeEventListener("ai:execute-action", handler);
  }, [isOpen, handleWriteAction]);

  // Listen for inline AI actions from floating toolbar
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { action: string; text: string } | undefined;
      if (detail?.action && detail?.text) {
        setInputText(detail.text);
        setActiveTab("write");
        handleWriteAction(detail.action as WritingAction);
      }
    };
    window.addEventListener("ai:inline-action", handler);
    return () => window.removeEventListener("ai:inline-action", handler);
  }, [handleWriteAction]);

  const handleChatSend = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return;

    const userMessage: ChatMessage = { role: "user", content: chatInput.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setChatInput("");
    setChatLoading(true);
    setStreamingContent("");

    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: userMessage.content,
          workspaceId,
          usePageContext,
          pageId: usePageContext ? pageId : undefined,
          history: [...messages, userMessage],
        }),
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
        throw new Error(errMsg || "AI 채팅 요청에 실패했습니다");
      }

      if (res.headers.get("content-type")?.includes("text/event-stream")) {
        let accumulated = "";
        for await (const text of parseSSEStream(res)) {
          accumulated += text;
          setStreamingContent(accumulated);
        }

        setMessages((prev) => [...prev, { role: "assistant", content: accumulated }]);
        setStreamingContent("");
      } else {
        const data = await res.json();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.answer || data.result || "" },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err instanceof Error ? err.message : "오류가 발생했습니다",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatLoading, messages, pageId, workspaceId, usePageContext]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(result);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch (_error) {
      /* fallback: do nothing */
    }
  }

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="AI 어시스턴트"
      className="fixed z-50 flex flex-col shadow-2xl
        bottom-0 left-0 right-0 h-[70vh] rounded-t-2xl
        md:bottom-auto md:left-auto md:right-0 md:top-0 md:h-full md:w-[420px] md:max-w-full md:rounded-none"
      style={{
        background: "var(--background)",
        borderLeft: "1px solid var(--border)",
        borderTop: "1px solid var(--border)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: "var(--primary)", color: "white" }}
          >
            <Sparkles size={14} />
          </div>
          <h3 className="font-semibold text-sm">AI 어시스턴트</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md transition-colors hover:bg-black/5 dark:hover:bg-white/10"
          aria-label="닫기"
        >
          <X size={15} style={{ color: "var(--muted)" }} />
        </button>
      </div>

      {/* Tabs */}
      <div
        className="flex mx-4 rounded-lg p-0.5"
        style={{ background: "var(--sidebar-bg)" }}
      >
        {(["write", "chat"] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 py-1.5 text-xs font-medium rounded-md transition-all"
            style={{
              background: activeTab === tab ? "var(--background)" : "transparent",
              color: activeTab === tab ? "var(--foreground)" : "var(--muted)",
              boxShadow:
                activeTab === tab ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
            }}
          >
            {tab === "write" ? "글쓰기 도우미" : "AI 채팅"}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "write" ? (
        <div className="flex-1 overflow-auto flex flex-col mt-3">
          {/* Collapsible input */}
          <div className="px-4 mb-2">
            <button
              onClick={() => setShowInput(!showInput)}
              className="flex items-center gap-1.5 text-xs font-medium w-full py-1"
              style={{ color: "var(--muted)" }}
            >
              <ChevronRight
                size={12}
                className="transition-transform"
                style={{ transform: showInput ? "rotate(90deg)" : "none" }}
              />
              입력 텍스트 {inputText ? `(${inputText.length}자)` : "(페이지 콘텐츠 사용)"}
            </button>
            {showInput && (
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="텍스트를 입력하거나 비워두면 페이지 전체를 사용합니다..."
                rows={4}
                className="w-full text-sm p-2.5 rounded-lg resize-none outline-none mt-1 transition-colors focus:ring-1"
                style={{
                  background: "var(--sidebar-bg)",
                  border: "1px solid var(--border)",
                }}
              />
            )}
          </div>

          {/* Action groups */}
          <div className="px-4 space-y-3 pb-3">
            {ACTION_GROUPS.map((group) => (
              <div key={group.title}>
                <p
                  className="text-[10px] font-semibold uppercase tracking-wider mb-1.5"
                  style={{ color: "var(--muted)" }}
                >
                  {group.title}
                </p>
                <div className="space-y-1">
                  {group.actions.map((def) => {
                    const isActive = activeAction === def.action;
                    const isExpanded = expandedAction === def.action;
                    const hasOptions = def.options && def.options.length > 0;

                    return (
                      <div key={def.action}>
                        <button
                          onClick={() => {
                            if (loading) return;
                            if (hasOptions) {
                              setExpandedAction(isExpanded ? null : def.action);
                            } else {
                              handleWriteAction(def.action);
                            }
                          }}
                          disabled={loading && !isActive}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all group"
                          style={{
                            background: isActive
                              ? "var(--primary)"
                              : "var(--sidebar-bg)",
                            color: isActive ? "white" : "inherit",
                            opacity: loading && !isActive ? 0.5 : 1,
                          }}
                        >
                          <span
                            className="shrink-0 transition-colors"
                            style={{
                              color: isActive ? "white" : "var(--primary)",
                            }}
                          >
                            {isActive ? (
                              <Loader2 size={15} className="animate-spin" />
                            ) : (
                              def.icon
                            )}
                          </span>
                          <span className="flex-1 text-left">
                            <span className="font-medium">{def.label}</span>
                            <span
                              className="ml-1.5 text-xs"
                              style={{
                                color: isActive
                                  ? "rgba(255,255,255,0.7)"
                                  : "var(--muted)",
                              }}
                            >
                              {def.description}
                            </span>
                          </span>
                          {hasOptions && !isActive && (
                            <ChevronRight
                              size={13}
                              className="transition-transform"
                              style={{
                                color: "var(--muted)",
                                transform: isExpanded
                                  ? "rotate(90deg)"
                                  : "none",
                              }}
                            />
                          )}
                        </button>

                        {/* Inline options */}
                        {hasOptions && isExpanded && !loading && (
                          <div className="flex flex-wrap gap-1.5 pl-10 mt-1.5 mb-1">
                            {def.options!.map((opt) => {
                              const isSelected =
                                optionValues[def.optionKey!] === opt.value;
                              return (
                                <button
                                  key={opt.value}
                                  onClick={() => {
                                    setOptionValues((prev) => ({
                                      ...prev,
                                      [def.optionKey!]: opt.value,
                                    }));
                                    handleWriteAction(def.action, {
                                      [def.optionKey!]: opt.value,
                                    });
                                  }}
                                  className="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
                                  style={{
                                    background: isSelected
                                      ? "var(--primary)"
                                      : "var(--background)",
                                    color: isSelected ? "white" : "var(--foreground)",
                                    border: `1px solid ${isSelected ? "var(--primary)" : "var(--border)"}`,
                                  }}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Result area */}
          {(result || error) && (
            <div
              className="mx-4 mb-4 rounded-lg overflow-hidden"
              style={{ border: "1px solid var(--border)" }}
              aria-live="polite"
            >
              {/* Result header */}
              <div
                className="flex items-center justify-between px-3 py-2"
                style={{
                  background: "var(--sidebar-bg)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--muted)" }}
                >
                  결과
                </span>
                {result && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setResult("");
                        setError(null);
                      }}
                      className="p-1 rounded transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                      title="초기화"
                      aria-label="초기화"
                    >
                      <RotateCcw size={12} style={{ color: "var(--muted)" }} />
                    </button>
                  </div>
                )}
              </div>

              {error && (
                <div
                  className="px-3 py-2 text-sm flex items-center justify-between gap-2"
                  style={{ background: "rgba(239,68,68,0.06)", color: "var(--danger, #ef4444)" }}
                >
                  <span>{error}</span>
                  <button
                    onClick={() => {
                      setError(null);
                      if (lastActionRef.current) {
                        handleWriteAction(lastActionRef.current);
                      }
                    }}
                    className="shrink-0 px-2 py-1 rounded text-xs font-medium transition-opacity hover:opacity-80"
                    style={{
                      background: "var(--danger, #ef4444)",
                      color: "white",
                    }}
                  >
                    재시도
                  </button>
                </div>
              )}

              {result && (
                <>
                  <div
                    ref={resultRef}
                    className="px-3 py-2.5 text-sm whitespace-pre-wrap overflow-auto leading-relaxed"
                    style={{ maxHeight: 280 }}
                  >
                    {result}
                    {loading && (
                      <span
                        className="inline-block w-1.5 h-4 ml-0.5 animate-pulse rounded-sm"
                        style={{
                          background: "var(--primary)",
                          verticalAlign: "text-bottom",
                        }}
                      />
                    )}
                  </div>

                  {/* Streaming status + character count */}
                  <div
                    className="flex items-center justify-between px-3 py-1.5 text-[11px]"
                    style={{ color: "var(--muted)" }}
                  >
                    <span>
                      {loading ? (
                        <span className="flex items-center gap-1">
                          <Loader2 size={10} className="animate-spin" />
                          생성 중...
                        </span>
                      ) : streamingDone ? (
                        <span style={{ color: "#22c55e" }}>&#10003; 생성 완료</span>
                      ) : null}
                    </span>
                    <span>결과: {result.length}자</span>
                  </div>

                  {/* Action bar */}
                  {!loading && (
                    <div
                      className="flex gap-2 px-3 py-2"
                      style={{
                        borderTop: "1px solid var(--border)",
                        background: "var(--sidebar-bg)",
                      }}
                    >
                      <button
                        onClick={() => onInsertText(result)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-white text-xs font-medium transition-opacity hover:opacity-90"
                        style={{ background: "var(--primary)" }}
                      >
                        <ArrowDownToLine size={13} />
                        에디터에 삽입
                      </button>
                      <button
                        onClick={handleCopy}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                        style={{
                          background: copyFeedback
                            ? "rgba(34,197,94,0.1)"
                            : "var(--background)",
                          border: `1px solid ${copyFeedback ? "rgba(34,197,94,0.3)" : "var(--border)"}`,
                          color: copyFeedback ? "var(--success, #16a34a)" : "var(--foreground)",
                        }}
                      >
                        {copyFeedback ? (
                          <Check size={13} />
                        ) : (
                          <Copy size={13} />
                        )}
                        {copyFeedback ? "복사됨" : "복사"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Empty state */}
          {!loading && !result && !error && (
            <div className="flex-1 flex items-center justify-center px-4">
              <p
                className="text-xs text-center leading-relaxed"
                style={{ color: "var(--muted)" }}
              >
                작업을 선택하면 AI가 텍스트를 처리합니다
              </p>
            </div>
          )}
        </div>
      ) : (
        /* Chat tab */
        <div className="flex-1 flex flex-col overflow-hidden mt-2">
          {/* Page context toggle + clear chat */}
          <div className="px-4 pb-2 flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <div
                role="switch"
                aria-checked={usePageContext}
                className="relative w-8 h-[18px] rounded-full transition-colors cursor-pointer"
                style={{
                  background: usePageContext ? "var(--primary)" : "var(--border)",
                }}
                onClick={() => setUsePageContext(!usePageContext)}
              >
                <div
                  className="absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform"
                  style={{
                    left: usePageContext ? "16px" : "2px",
                  }}
                />
              </div>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                페이지 컨텍스트 사용
              </span>
            </label>
            {messages.length > 0 && (
              <button
                onClick={handleClearChat}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                style={{ color: "var(--muted)" }}
                title="대화 초기화"
              >
                <Trash2 size={12} />
                초기화
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-auto px-4 space-y-3">
            {messages.length === 0 && !streamingContent && (
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ background: "var(--sidebar-bg)" }}
                >
                  <Bot size={20} style={{ color: "var(--muted)" }} />
                </div>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  페이지에 대해 질문하거나 아이디어를 나눠보세요
                </p>
              </div>
            )}

            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: "var(--primary)", color: "white" }}
                  >
                    <Bot size={13} />
                  </div>
                )}
                <div
                  className="max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed"
                  style={{
                    background:
                      msg.role === "user" ? "var(--primary)" : "var(--sidebar-bg)",
                    color: msg.role === "user" ? "white" : "inherit",
                    borderBottomRightRadius: msg.role === "user" ? "4px" : undefined,
                    borderBottomLeftRadius: msg.role === "assistant" ? "4px" : undefined,
                  }}
                >
                  {msg.content}
                </div>
                {msg.role === "user" && (
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: "var(--sidebar-hover)" }}
                  >
                    <User size={13} />
                  </div>
                )}
              </div>
            ))}

            {streamingContent && (
              <div className="flex gap-2 justify-start">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: "var(--primary)", color: "white" }}
                >
                  <Bot size={13} />
                </div>
                <div
                  className="max-w-[80%] px-3 py-2 rounded-2xl rounded-bl text-sm whitespace-pre-wrap leading-relaxed"
                  style={{ background: "var(--sidebar-bg)" }}
                >
                  {streamingContent}
                  <span
                    className="inline-block w-1.5 h-4 ml-0.5 animate-pulse rounded-sm"
                    style={{
                      background: "var(--primary)",
                      verticalAlign: "text-bottom",
                    }}
                  />
                </div>
              </div>
            )}

            {chatLoading && !streamingContent && (
              <div className="flex gap-2 justify-start">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "var(--primary)", color: "white" }}
                >
                  <Bot size={13} />
                </div>
                <div
                  className="px-3 py-2.5 rounded-2xl rounded-bl"
                  style={{ background: "var(--sidebar-bg)" }}
                >
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--muted)", animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--muted)", animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: "var(--muted)", animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          <div className="p-3" style={{ borderTop: "1px solid var(--border)" }}>
            <div
              className="flex items-end gap-2 rounded-xl px-3 py-2"
              style={{
                background: "var(--sidebar-bg)",
                border: "1px solid var(--border)",
              }}
            >
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="메시지를 입력하세요..."
                rows={1}
                className="flex-1 text-sm resize-none outline-none bg-transparent py-0.5"
                style={{ maxHeight: "calc(1.5em * 5 + 4px)" }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = `${Math.min(target.scrollHeight, 5 * 24)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleChatSend();
                  }
                }}
              />
              <div className="flex items-end gap-1 shrink-0">
                {chatInput.length > 100 && (
                  <span
                    className="text-[10px] pb-1"
                    style={{ color: "var(--muted)" }}
                  >
                    {chatInput.length}
                  </span>
                )}
                <button
                  onClick={handleChatSend}
                  disabled={!chatInput.trim() || chatLoading}
                  aria-label="전송"
                  className="p-1.5 rounded-lg transition-all disabled:opacity-30"
                  style={{
                    background: chatInput.trim() ? "var(--primary)" : "transparent",
                    color: chatInput.trim() ? "white" : "var(--muted)",
                  }}
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
            <p
              className="text-[10px] text-center mt-1.5"
              style={{ color: "var(--muted)" }}
            >
              Enter로 전송 · Shift+Enter로 줄바꿈
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
