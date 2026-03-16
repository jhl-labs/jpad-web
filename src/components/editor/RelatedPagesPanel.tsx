"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface RelatedPageEntry {
  id: string;
  title: string;
  slug: string;
  icon: string | null;
  snippet: string | null;
  matchType?: string;
}

export function RelatedPagesPanel({
  workspaceId,
  pageId,
}: {
  workspaceId: string;
  pageId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState<RelatedPageEntry[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function fetchRelatedPages() {
      setLoading(true);
      setError("");

      try {
        const res = await fetch(`/api/pages/${pageId}/related`);
        const data = (await res.json().catch(() => null)) as
          | { error?: string; data?: RelatedPageEntry[] }
          | null;
        if (!res.ok) {
          throw new Error(data?.error || "관련 문서를 불러오지 못했습니다.");
        }

        if (!cancelled) {
          setItems(Array.isArray(data?.data) ? data.data : []);
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "관련 문서를 불러오지 못했습니다."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void fetchRelatedPages();

    return () => {
      cancelled = true;
    };
  }, [pageId]);

  return (
    <div
      className="mt-6 rounded-xl px-4 py-4"
      style={{
        background: "var(--sidebar-bg)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="mb-3">
        <h3 className="text-sm font-semibold">관련 문서</h3>
        <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
          현재 문서와 의미적으로 가까운 페이지를 추천합니다.
        </p>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          관련 문서를 찾는 중입니다...
        </p>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          아직 추천할 관련 문서가 없습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/workspace/${workspaceId}/page/${item.id}`}
              className="block rounded-lg px-3 py-3 hover:opacity-80"
              style={{
                background: "var(--background)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="flex items-center gap-2">
                <span>{item.icon || "📄"}</span>
                <span className="text-sm font-medium">{item.title || "제목 없음"}</span>
              </div>
              <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                {item.slug}
              </div>
              {item.snippet && (
                <p className="mt-2 text-xs line-clamp-2" style={{ color: "var(--muted)" }}>
                  {item.snippet}
                </p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
