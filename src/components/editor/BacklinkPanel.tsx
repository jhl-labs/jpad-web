"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";

interface LinkedPage {
  id: string;
  title: string;
  slug: string;
  icon: string | null;
}

export function BacklinkPanel({
  pageId,
  workspaceId,
}: {
  pageId: string;
  workspaceId: string;
}) {
  const router = useRouter();
  const [incoming, setIncoming] = useState<LinkedPage[]>([]);
  const [outgoing, setOutgoing] = useState<LinkedPage[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch(`/api/backlinks?pageId=${pageId}&workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((data) => {
        setIncoming(data.incoming || []);
        setOutgoing(data.outgoing || []);
      })
      .catch((error) => { console.error("[BacklinkPanel] fetch failed:", error); });
  }, [pageId, workspaceId]);

  const total = incoming.length + outgoing.length;
  if (total === 0) return null;

  return (
    <div
      className="px-4 md:px-8 lg:px-16 py-3 shrink-0"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-sm"
        style={{ color: "var(--muted)" }}
      >
        <Link2 size={14} /> {total}개 백링크
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {incoming.length > 0 && (
            <div>
              <div className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>
                이 페이지를 참조하는 페이지
              </div>
              {incoming.map((p) => (
                <button
                  key={p.id}
                  onClick={() => router.push(`/workspace/${workspaceId}/page/${p.id}`)}
                  className="block text-sm py-0.5 hover:underline"
                  style={{ color: "var(--primary)" }}
                >
                  {p.icon || ""} {p.title}
                </button>
              ))}
            </div>
          )}
          {outgoing.length > 0 && (
            <div>
              <div className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>
                이 페이지가 참조하는 페이지
              </div>
              {outgoing.map((p) => (
                <button
                  key={p.id}
                  onClick={() => router.push(`/workspace/${workspaceId}/page/${p.id}`)}
                  className="block text-sm py-0.5 hover:underline"
                  style={{ color: "var(--primary)" }}
                >
                  {p.icon || ""} {p.title}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
