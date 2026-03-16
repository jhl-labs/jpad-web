"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Plus, FileText, Layout, Calendar, CheckSquare, BookOpen,
} from "lucide-react";
import { OnboardingChecklist } from "@/components/ui/OnboardingChecklist";

interface PageItem {
  id: string;
  title: string;
  slug: string;
  icon: string | null;
  position: number;
  parentId: string | null;
  updatedAt: string;
}

function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay === 1) return "어제";
  if (diffDay < 7) return `${diffDay}일 전`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}주 전`;
  return `${Math.floor(diffDay / 30)}개월 전`;
}

export default function WorkspaceHomePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const [pages, setPages] = useState<PageItem[]>([]);
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceRole, setWorkspaceRole] = useState("viewer");
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pages?workspaceId=${workspaceId}`)
      .then((r) => r.json())
      .then((data: PageItem[]) => setPages(data))
      .catch(() => {});
    fetch(`/api/workspaces/${workspaceId}`)
      .then((r) => r.json())
      .then((ws: { name: string; currentRole?: string }) => {
        setWorkspaceName(ws.name);
        setWorkspaceRole(ws.currentRole || "viewer");
      })
      .catch(() => {});
  }, [workspaceId]);

  const recentPages = [...pages]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);

  async function handleCreatePage() {
    if (workspaceRole === "viewer") return;
    setCreateError(null);

    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (res.ok) {
        const page = await res.json();
        router.push(`/workspace/${workspaceId}/page/${page.id}`);
      } else {
        const data = await res.json().catch(() => null);
        setCreateError((data as { error?: string } | null)?.error || "페이지 생성에 실패했습니다.");
      }
    } catch {
      setCreateError("페이지 생성 요청 중 네트워크 오류가 발생했습니다.");
    }
  }

  const canCreate = workspaceRole !== "viewer";
  const isEmpty = pages.length === 0;

  const quickLinks = [
    {
      icon: <Calendar size={20} style={{ color: "var(--primary)" }} />,
      label: "캘린더",
      description: "일정을 한눈에",
      href: `/workspace/${workspaceId}/calendar`,
    },
    {
      icon: <CheckSquare size={20} style={{ color: "var(--primary)" }} />,
      label: "할 일",
      description: "작업을 추적하세요",
      href: `/workspace/${workspaceId}/todos`,
    },
    {
      icon: <BookOpen size={20} style={{ color: "var(--primary)" }} />,
      label: "오늘의 노트",
      description: "매일 기록하세요",
      href: `/workspace/${workspaceId}/daily`,
    },
  ];

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Workspace Header */}
        <h1 className="text-3xl font-bold mb-8">{workspaceName}</h1>

        {/* 온보딩 체크리스트 */}
        <div className="mb-8">
          <OnboardingChecklist
            workspaceId={workspaceId}
            hasPages={pages.length > 0}
            onCreatePage={handleCreatePage}
          />
        </div>

        {/* 시작하기 (빈 상태일 때 강조 표시) */}
        {isEmpty ? (
          <section className="mb-10">
            <div
              className="rounded-xl p-8 text-center"
              style={{
                background: "var(--sidebar-bg)",
                border: "1px solid var(--border)",
              }}
            >
              <h2 className="text-lg font-semibold mb-2">시작하기</h2>
              <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
                워크스페이스가 비어 있습니다. 첫 페이지를 만들어보세요.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={handleCreatePage}
                  disabled={!canCreate}
                  className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg text-sm font-semibold transition-opacity hover:opacity-80"
                  style={{
                    background: "var(--primary)",
                    color: "white",
                    opacity: canCreate ? 1 : 0.5,
                    cursor: canCreate ? "pointer" : "not-allowed",
                  }}
                >
                  <Plus size={18} />
                  새 페이지 만들기
                </button>
                <button
                  onClick={() => window.dispatchEvent(new Event("template-picker:open"))}
                  disabled={!canCreate}
                  className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
                  style={{
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                    opacity: canCreate ? 1 : 0.5,
                    cursor: canCreate ? "pointer" : "not-allowed",
                  }}
                >
                  <Layout size={16} />
                  템플릿에서 시작
                </button>
              </div>
            </div>

            {/* 바로가기 카드 3개 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
              {quickLinks.map((link) => (
                <button
                  key={link.label}
                  onClick={() => router.push(link.href)}
                  className="flex items-start gap-3 p-4 rounded-lg text-left transition-colors"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--background)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--sidebar-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--background)";
                  }}
                >
                  <div
                    className="p-2 rounded-lg shrink-0"
                    style={{ background: "var(--sidebar-bg)" }}
                  >
                    {link.icon}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{link.label}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                      {link.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ) : (
          /* 빈 상태가 아닐 때 빠른 시작 */
          <section className="mb-10">
            <h2 className="text-sm font-medium uppercase mb-3" style={{ color: "var(--muted)" }}>
              빠른 시작
            </h2>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleCreatePage}
                disabled={!canCreate}
                className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
                style={{
                  background: "var(--primary)",
                  color: "white",
                  opacity: canCreate ? 1 : 0.5,
                  cursor: canCreate ? "pointer" : "not-allowed",
                }}
              >
                <Plus size={16} />
                새 페이지 만들기
              </button>
              <button
                onClick={() => window.dispatchEvent(new Event("template-picker:open"))}
                disabled={!canCreate}
                className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
                style={{
                  background: "var(--background)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                  opacity: canCreate ? 1 : 0.5,
                  cursor: canCreate ? "pointer" : "not-allowed",
                }}
              >
                <Layout size={16} />
                템플릿에서 시작
              </button>
            </div>

            {/* 바로가기 카드 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
              {quickLinks.map((link) => (
                <button
                  key={link.label}
                  onClick={() => router.push(link.href)}
                  className="flex items-center gap-3 p-3 rounded-lg text-left transition-colors"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--background)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--sidebar-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--background)";
                  }}
                >
                  {link.icon}
                  <div>
                    <div className="text-sm font-medium">{link.label}</div>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>
                      {link.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* 최근 편집한 페이지 (최대 5개) */}
        {recentPages.length > 0 && (
          <section>
            <h2 className="text-sm font-medium uppercase mb-3" style={{ color: "var(--muted)" }}>
              최근 편집한 페이지
            </h2>
            <div className="flex flex-col gap-1">
              {recentPages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => router.push(`/workspace/${workspaceId}/page/${page.id}`)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--background)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--sidebar-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--background)";
                  }}
                >
                  <div className="text-lg shrink-0">
                    {page.icon || <FileText size={18} style={{ color: "var(--muted)" }} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium truncate block">
                      {page.title}
                    </span>
                  </div>
                  <span className="text-xs shrink-0" style={{ color: "var(--muted)" }}>
                    {getRelativeTime(page.updatedAt)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
