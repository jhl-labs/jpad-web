"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Network } from "lucide-react";
import { KnowledgeGraph } from "@/components/graph/KnowledgeGraph";

export default function GraphPage() {
  const { workspaceId, pageId } = useParams<{
    workspaceId: string;
    pageId?: string;
  }>();
  const router = useRouter();

  return (
    <div className="h-full flex flex-col">
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <button
          onClick={() => router.back()}
          className="p-1 rounded hover:opacity-70"
          title="뒤로"
        >
          <ArrowLeft size={18} />
        </button>
        <Network size={18} style={{ color: "var(--primary)" }} />
        <h1 className="text-lg font-semibold">지식 그래프</h1>
      </div>
      <div className="flex-1 min-h-0">
        <KnowledgeGraph workspaceId={workspaceId} currentPageId={pageId} />
      </div>
    </div>
  );
}
