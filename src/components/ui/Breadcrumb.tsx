"use client";

import Link from "next/link";

interface BreadcrumbPage {
  id: string;
  title: string;
  parentId: string | null;
}

interface BreadcrumbProps {
  workspaceId: string;
  workspaceName: string;
  pages: BreadcrumbPage[];
  currentPageId: string;
}

export function Breadcrumb({ workspaceId, workspaceName, pages, currentPageId }: BreadcrumbProps) {
  // 부모 체인을 추적하여 경로 구성
  const chain: BreadcrumbPage[] = [];
  let current = pages.find((p) => p.id === currentPageId);

  while (current) {
    chain.unshift(current);
    if (current.parentId) {
      current = pages.find((p) => p.id === current!.parentId);
    } else {
      break;
    }
  }

  // 3개 초과 시 첫 번째 + ... + 마지막 2개만 표시
  const shouldTruncate = chain.length > 3;
  const displayChain = shouldTruncate
    ? [chain[0], ...chain.slice(-2)]
    : chain;

  return (
    <nav className="flex items-center gap-1 text-sm flex-wrap" style={{ color: "var(--muted)" }}>
      <Link
        href={`/workspace/${workspaceId}`}
        className="hover:underline truncate max-w-[150px]"
        style={{ color: "var(--muted)" }}
      >
        {workspaceName}
      </Link>
      {displayChain.map((page, i) => {
        const isLast = i === displayChain.length - 1;
        const showEllipsis = shouldTruncate && i === 0;
        return (
          <span key={page.id} className="flex items-center gap-1">
            <span style={{ color: "var(--muted)" }}>/</span>
            {isLast ? (
              <span className="truncate max-w-[150px]" style={{ color: "var(--foreground)" }}>
                {page.title || "제목 없음"}
              </span>
            ) : (
              <Link
                href={`/workspace/${workspaceId}/page/${page.id}`}
                className="hover:underline truncate max-w-[150px]"
                style={{ color: "var(--muted)" }}
              >
                {page.title || "제목 없음"}
              </Link>
            )}
            {showEllipsis && (
              <>
                <span style={{ color: "var(--muted)" }}>/</span>
                <span style={{ color: "var(--muted)" }}>...</span>
              </>
            )}
          </span>
        );
      })}
    </nav>
  );
}
