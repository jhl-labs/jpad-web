"use client";

import { ExternalLink } from "lucide-react";

export default function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const issueUrl = `https://github.com/jhl-labs/jpad-web/issues/new?template=bug_report.md&title=${encodeURIComponent("Error: " + (error.message || "Unknown error"))}&body=${encodeURIComponent(`## 오류 정보\n\n- Message: \`${error.message}\`\n- Digest: \`${error.digest || "N/A"}\`\n- URL: \`${typeof window !== "undefined" ? window.location.href : ""}\`\n- Time: \`${new Date().toISOString()}\`\n\n## 재현 방법\n\n1. \n`)}`;

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <p className="text-lg font-semibold mb-2">오류가 발생했습니다</p>
        <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
          {error.message || "페이지를 렌더링하는 중 문제가 발생했습니다."}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 rounded text-sm text-white"
            style={{ background: "var(--primary)" }}
          >
            다시 시도
          </button>
          <a
            href={issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-4 py-2 rounded text-sm font-medium transition-colors"
            style={{ border: "1px solid var(--border)", color: "var(--foreground)" }}
          >
            <ExternalLink size={14} />
            이 문제를 GitHub에 보고하기
          </a>
        </div>
      </div>
    </div>
  );
}
