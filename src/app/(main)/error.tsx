"use client";

import { useEffect } from "react";

export default function MainErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[MainErrorBoundary]", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center h-full min-h-[50vh]">
      <div className="text-center max-w-md px-4">
        <h2 className="text-lg font-semibold mb-2">문제가 발생했습니다</h2>
        <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
          예상치 못한 오류가 발생했습니다. 새로고침하거나 문제가 지속되면 이슈를 등록해 주세요.
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
            href="https://github.com/jhl-labs/jpad-web/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded text-sm"
            style={{ border: "1px solid var(--border)", color: "var(--foreground)" }}
          >
            GitHub 이슈 등록
          </a>
        </div>
      </div>
    </div>
  );
}
