"use client";

import { useState, useEffect, useRef } from "react";
import { X, Bug, Lightbulb, MessageSquare } from "lucide-react";

type FeedbackType = "bug" | "feature" | "other";

const feedbackTypes: { id: FeedbackType; label: string; icon: React.ReactNode; template: string }[] = [
  { id: "bug", label: "버그 제보", icon: <Bug size={16} />, template: "bug_report.md" },
  { id: "feature", label: "기능 요청", icon: <Lightbulb size={16} />, template: "feature_request.md" },
  { id: "other", label: "기타 피드백", icon: <MessageSquare size={16} />, template: "" },
];

function collectEnvironmentInfo(): string {
  if (typeof window === "undefined") return "";
  const ua = navigator.userAgent;
  const platform = navigator.platform || "unknown";
  const lang = navigator.language || "unknown";
  const screen = `${window.screen.width}x${window.screen.height}`;
  const viewport = `${window.innerWidth}x${window.innerHeight}`;
  return [
    "---",
    "**환경 정보** (자동 수집)",
    `- User Agent: \`${ua}\``,
    `- Platform: \`${platform}\``,
    `- Language: \`${lang}\``,
    `- Screen: \`${screen}\``,
    `- Viewport: \`${viewport}\``,
    `- URL: \`${window.location.href}\``,
    `- Time: \`${new Date().toISOString()}\``,
  ].join("\n");
}

export function FeedbackModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("bug");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOpen() {
      setIsOpen(true);
    }
    window.addEventListener("feedback:open", handleOpen);
    return () => window.removeEventListener("feedback:open", handleOpen);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen]);

  function handleClose() {
    setIsOpen(false);
    setTitle("");
    setDescription("");
    setType("bug");
    setSuccessMessage(null);
  }

  function handleSubmitGitHub() {
    const envInfo = collectEnvironmentInfo();
    const body = [description, "", envInfo].filter(Boolean).join("\n");
    const typeConfig = feedbackTypes.find((t) => t.id === type);
    const templateParam = typeConfig?.template ? `&template=${typeConfig.template}` : "";
    const labels = type === "bug" ? "&labels=bug" : type === "feature" ? "&labels=enhancement" : "";
    const url = `https://github.com/jhl-labs/jpad-web/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}${templateParam}${labels}`;
    window.open(url, "_blank");
    handleClose();
  }

  function handleSubmitLocal() {
    const envInfo = collectEnvironmentInfo();
    console.log("[jpad feedback]", { type, title, description, env: envInfo });
    setSuccessMessage("피드백이 기록되었습니다. 감사합니다!");
    setTitle("");
    setDescription("");
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="피드백 보내기"
        className="w-full max-w-md mx-4 rounded-xl shadow-2xl"
        style={{ background: "var(--background)", border: "1px solid var(--border)" }}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-base font-semibold">피드백 보내기</h2>
          <button onClick={handleClose} className="p-1 rounded hover:opacity-70" title="닫기">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* 성공 메시지 */}
          {successMessage && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm"
              style={{
                background: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.2)",
                color: "#22c55e",
              }}
            >
              {successMessage}
            </div>
          )}

          {/* 유형 선택 */}
          <div>
            <label className="text-sm font-medium block mb-2">유형</label>
            <div className="flex gap-2">
              {feedbackTypes.map((ft) => (
                <button
                  key={ft.id}
                  onClick={() => setType(ft.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    border: type === ft.id ? "2px solid var(--primary)" : "1px solid var(--border)",
                    background: type === ft.id ? "var(--sidebar-bg)" : "transparent",
                    color: type === ft.id ? "var(--primary)" : "var(--foreground)",
                  }}
                >
                  {ft.icon}
                  {ft.label}
                </button>
              ))}
            </div>
          </div>

          {/* 제목 */}
          <div>
            <label className="text-sm font-medium block mb-1.5">
              제목 <span style={{ color: "#ef4444" }}>*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={type === "bug" ? "어떤 문제가 발생했나요?" : type === "feature" ? "어떤 기능을 원하시나요?" : "제목을 입력하세요"}
              className="w-full px-3 py-2 rounded-md text-sm bg-transparent outline-none"
              style={{ border: "1px solid var(--border)" }}
              maxLength={200}
            />
          </div>

          {/* 설명 */}
          <div>
            <label className="text-sm font-medium block mb-1.5">설명 (선택)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="자세한 내용을 입력하세요..."
              rows={4}
              className="w-full px-3 py-2 rounded-md text-sm bg-transparent outline-none resize-y"
              style={{ border: "1px solid var(--border)" }}
            />
          </div>

          <div className="text-xs" style={{ color: "var(--muted)" }}>
            브라우저 및 OS 정보가 자동으로 포함됩니다.
          </div>
        </div>

        {/* 하단 버튼 */}
        <div
          className="flex items-center justify-between gap-3 px-5 py-4"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button
            onClick={handleSubmitLocal}
            disabled={!title.trim()}
            className="px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            style={{ border: "1px solid var(--border)" }}
          >
            로컬에서만 기록
          </button>
          <button
            onClick={handleSubmitGitHub}
            disabled={!title.trim()}
            className="px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            style={{ background: "var(--primary)", color: "white" }}
          >
            GitHub Issue로 제출
          </button>
        </div>
      </div>
    </div>
  );
}
