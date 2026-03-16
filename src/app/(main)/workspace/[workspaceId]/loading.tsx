"use client";

import { Skeleton } from "@/components/ui/Skeleton";

export default function WorkspaceLoading() {
  return (
    <div className="flex h-screen">
      {/* 사이드바 스켈레톤 */}
      <aside
        className="w-60 h-full flex flex-col shrink-0 p-3 gap-3"
        style={{ background: "var(--sidebar-bg)", borderRight: "1px solid var(--border)" }}
      >
        {/* 워크스페이스 헤더 */}
        <Skeleton className="h-8 w-3/4" />
        <div className="mt-4 flex flex-col gap-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-4/5" />
          <Skeleton className="h-7 w-full" />
        </div>
        <div className="mt-auto">
          <Skeleton className="h-8 w-2/3" />
        </div>
      </aside>

      {/* 메인 영역 스켈레톤 */}
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center flex flex-col items-center gap-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
      </main>
    </div>
  );
}
