"use client";

import { Skeleton } from "@/components/ui/Skeleton";

export default function PageEditorLoading() {
  return (
    <div className="h-full flex flex-col">
      {/* 툴바 스켈레톤 */}
      <div
        className="flex items-center justify-end gap-2 px-4 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <Skeleton className="h-7 w-20" />
        <Skeleton className="h-7 w-16" />
      </div>

      {/* 제목 스켈레톤 */}
      <div className="px-4 md:px-8 lg:px-16 pt-6 md:pt-12 pb-2">
        <Skeleton className="h-10 w-2/3" />
      </div>

      {/* 에디터 라인 스켈레톤 */}
      <div className="flex-1 px-4 md:px-8 lg:px-16 pt-4 flex flex-col gap-3">
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-5/6" />
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-5 w-5/6" />
        <Skeleton className="h-5 w-1/2" />
      </div>
    </div>
  );
}
