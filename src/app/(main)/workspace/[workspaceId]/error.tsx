"use client";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center">
        <p className="text-lg font-semibold mb-2">오류가 발생했습니다</p>
        <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>
          {error.message || "워크스페이스를 불러오는 중 문제가 발생했습니다."}
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 rounded text-sm text-white"
          style={{ background: "var(--primary)" }}
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}
