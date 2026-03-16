"use client";

import { useEffect } from "react";
import { ExternalLink } from "lucide-react";

export default function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[PageErrorBoundary]", error);
  }, [error]);

  const issueUrl = `https://github.com/jhl-labs/jpad-web/issues/new?template=bug_report.md&title=${encodeURIComponent("Error: " + (error.message || "Unknown error"))}&body=${encodeURIComponent(`## 오류 정보\n\n- Message: \`${error.message}\`\n- Digest: \`${error.digest || "N/A"}\`\n- URL: \`${typeof window !== "undefined" ? window.location.href : ""}\`\n- Time: \`${new Date().toISOString()}\`\n\n## 재현 방법\n\n1. \n`)}`;

  return (
    <div className="flex items-center justify-center h-full min-h-[50vh]">
      <div className="text-center max-w-md px-4">
        <p className="text-lg font-semibold mb-2">문제가 발생했습니다</p>
        <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
          페이지를 렌더링하는 중 문제가 발생했습니다. 새로고침하거나 문제가 지속되면 이슈를 등록해 주세요.
        </p>

        <details className="text-left mb-4 rounded p-3 text-xs" style={{ background: "var(--sidebar-hover)", color: "var(--muted)" }}>
          <summary className="cursor-pointer font-medium mb-1">오류 상세</summary>
          <pre className="whitespace-pre-wrap break-all mt-1">{error.message}</pre>
        </details>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="px-4 py-2 rounded text-sm text-white"
            style={{ background: "var(--primary)" }}
          >
            새로고침
          </button>
          <a
            href={issueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-4 py-2 rounded text-sm font-medium transition-colors"
            style={{ border: "1px solid var(--border)", color: "var(--foreground)" }}
          >
            <ExternalLink size={14} />
            GitHub 이슈 등록
          </a>
        </div>
      </div>
    </div>
  );
}
