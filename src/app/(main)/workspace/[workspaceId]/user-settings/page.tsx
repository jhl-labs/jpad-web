"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  User,
  Palette,
  Database,
  Bell,
  Info,
  FileCode,
  Sun,
  Moon,
  Monitor,
  ExternalLink,
  Download,
  Upload,
  Trash2,
  Check,
  Loader2,
  RefreshCw,
} from "lucide-react";

// ── 타입 ──────────────────────────────────────────────────────

type TabId = "profile" | "theme" | "data" | "notifications" | "version" | "opensource";

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

interface ProfileData {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string;
}

// ── 오픈소스 의존성 데이터 ──────────────────────────────────────

interface Dependency {
  name: string;
  version: string;
  license: string;
  url: string;
}

interface DependencyCategory {
  label: string;
  dependencies: Dependency[];
}

const dependencyCategories: DependencyCategory[] = [
  {
    label: "에디터",
    dependencies: [
      { name: "@blocknote/core", version: "0.47.1", license: "MPL-2.0", url: "https://github.com/TypeCellOS/BlockNote" },
      { name: "@blocknote/mantine", version: "0.47.1", license: "MPL-2.0", url: "https://github.com/TypeCellOS/BlockNote" },
      { name: "@blocknote/react", version: "0.47.1", license: "MPL-2.0", url: "https://github.com/TypeCellOS/BlockNote" },
      { name: "@blocknote/shadcn", version: "0.22.0", license: "MPL-2.0", url: "https://github.com/TypeCellOS/BlockNote" },
    ],
  },
  {
    label: "프레임워크",
    dependencies: [
      { name: "next", version: "15.5.12", license: "MIT", url: "https://nextjs.org" },
      { name: "react", version: "19.2.4", license: "MIT", url: "https://react.dev" },
      { name: "react-dom", version: "19.2.4", license: "MIT", url: "https://react.dev" },
      { name: "next-auth", version: "4.24.13", license: "ISC", url: "https://authjs.dev" },
      { name: "tailwindcss", version: "4.2.1", license: "MIT", url: "https://tailwindcss.com" },
      { name: "typescript", version: "5.9.3", license: "Apache-2.0", url: "https://www.typescriptlang.org" },
    ],
  },
  {
    label: "데이터베이스",
    dependencies: [
      { name: "@prisma/client", version: "6.19.2", license: "Apache-2.0", url: "https://www.prisma.io" },
      { name: "prisma", version: "6.19.2", license: "Apache-2.0", url: "https://www.prisma.io" },
      { name: "ioredis", version: "5.10.0", license: "MIT", url: "https://github.com/luin/ioredis" },
    ],
  },
  {
    label: "실시간",
    dependencies: [
      { name: "yjs", version: "13.6.30", license: "MIT", url: "https://docs.yjs.dev" },
      { name: "y-websocket", version: "2.1.0", license: "MIT", url: "https://github.com/yjs/y-websocket" },
      { name: "y-protocols", version: "1.0.7", license: "MIT", url: "https://github.com/yjs/y-protocols" },
      { name: "ws", version: "8.19.0", license: "MIT", url: "https://github.com/websockets/ws" },
      { name: "lib0", version: "0.2.117", license: "MIT", url: "https://github.com/dmonad/lib0" },
    ],
  },
  {
    label: "AI",
    dependencies: [
      { name: "@anthropic-ai/sdk", version: "0.78.0", license: "MIT", url: "https://github.com/anthropics/anthropic-sdk-typescript" },
    ],
  },
  {
    label: "기타",
    dependencies: [
      { name: "@aws-sdk/client-s3", version: "3.1010.0", license: "Apache-2.0", url: "https://github.com/aws/aws-sdk-js-v3" },
      { name: "@dnd-kit/core", version: "6.3.1", license: "MIT", url: "https://github.com/clauderic/dnd-kit" },
      { name: "@dnd-kit/sortable", version: "10.0.0", license: "MIT", url: "https://github.com/clauderic/dnd-kit" },
      { name: "@dnd-kit/utilities", version: "3.2.2", license: "MIT", url: "https://github.com/clauderic/dnd-kit" },
      { name: "@mantine/core", version: "8.3.17", license: "MIT", url: "https://mantine.dev" },
      { name: "@mantine/hooks", version: "8.3.17", license: "MIT", url: "https://mantine.dev" },
      { name: "@node-saml/node-saml", version: "5.1.0", license: "MIT", url: "https://github.com/node-saml/node-saml" },
      { name: "bcryptjs", version: "2.4.3", license: "MIT", url: "https://github.com/dcodeIO/bcrypt.js" },
      { name: "class-variance-authority", version: "0.7.1", license: "Apache-2.0", url: "https://github.com/joe-bell/cva" },
      { name: "clsx", version: "2.1.1", license: "MIT", url: "https://github.com/lukeed/clsx" },
      { name: "concurrently", version: "9.2.1", license: "MIT", url: "https://github.com/open-cli-tools/concurrently" },
      { name: "fflate", version: "0.8.2", license: "MIT", url: "https://101arrowz.github.io/fflate" },
      { name: "isomorphic-git", version: "1.37.4", license: "MIT", url: "https://isomorphic-git.org" },
      { name: "lucide-react", version: "0.468.0", license: "ISC", url: "https://lucide.dev" },
      { name: "postcss", version: "8.5.8", license: "MIT", url: "https://postcss.org" },
      { name: "rehype-sanitize", version: "6.0.0", license: "MIT", url: "https://github.com/rehypejs/rehype-sanitize" },
      { name: "rehype-stringify", version: "10.0.1", license: "MIT", url: "https://github.com/rehypejs/rehype" },
      { name: "remark-gfm", version: "4.0.1", license: "MIT", url: "https://github.com/remarkjs/remark-gfm" },
      { name: "remark-parse", version: "11.0.0", license: "MIT", url: "https://remark.js.org" },
      { name: "remark-rehype", version: "11.1.2", license: "MIT", url: "https://github.com/remarkjs/remark-rehype" },
      { name: "remark-stringify", version: "11.0.0", license: "MIT", url: "https://remark.js.org" },
      { name: "tailwind-merge", version: "2.6.1", license: "MIT", url: "https://github.com/dcastil/tailwind-merge" },
      { name: "unified", version: "11.0.5", license: "MIT", url: "https://unifiedjs.com" },
      { name: "uuid", version: "11.1.0", license: "MIT", url: "https://github.com/uuidjs/uuid" },
      { name: "zod", version: "3.25.76", license: "MIT", url: "https://zod.dev" },
    ],
  },
];

const APP_VERSION = "1.0.0";

// ── 유틸 ──────────────────────────────────────────────────────

function LicenseBadge({ license }: { license: string }) {
  const isMPL = license === "MPL-2.0";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "1px 8px",
        borderRadius: "9999px",
        fontSize: "11px",
        fontWeight: 600,
        background: isMPL ? "#fef3c7" : "var(--sidebar-bg)",
        color: isMPL ? "#92400e" : "var(--muted)",
        border: isMPL ? "1px solid #f59e0b" : "1px solid var(--border)",
      }}
    >
      {license}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-semibold mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ border: "1px solid var(--border)", background: "var(--sidebar-bg)" }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">{label}</div>
          {description && (
            <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              {description}
            </div>
          )}
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    </div>
  );
}

// ── 메인 페이지 ─────────────────────────────────────────────────

export default function UserSettingsPage() {
  const router = useRouter();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  const tabs: TabDef[] = [
    { id: "profile", label: "프로필", icon: <User size={16} /> },
    { id: "theme", label: "테마 & 외관", icon: <Palette size={16} /> },
    { id: "data", label: "데이터 관리", icon: <Database size={16} /> },
    { id: "notifications", label: "알림 설정", icon: <Bell size={16} /> },
    { id: "version", label: "버전 & 업데이트", icon: <Info size={16} /> },
    { id: "opensource", label: "오픈소스 고지", icon: <FileCode size={16} /> },
  ];

  return (
    <div
      className="flex-1 overflow-auto"
      style={{ background: "var(--background)", color: "var(--foreground)" }}
    >
      {/* 헤더 */}
      <div
        className="flex items-center gap-3 px-6 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <button
          onClick={() => router.push(`/workspace/${workspaceId}`)}
          className="p-1.5 rounded hover:opacity-70"
          title="뒤로 가기"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="text-lg font-semibold">설정</h1>
      </div>

      {/* 본문: 좌측 탭 + 우측 콘텐츠 */}
      <div className="flex flex-col md:flex-row">
        {/* 탭 목록 — 모바일: 상단 가로 스크롤, 데스크탑: 좌측 세로 */}
        <nav
          className="md:w-52 shrink-0 overflow-x-auto md:overflow-x-visible"
          style={{ borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex md:flex-col p-2 gap-0.5 min-w-max md:min-w-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap"
                style={{
                  background: activeTab === tab.id ? "var(--sidebar-hover)" : "transparent",
                  color: activeTab === tab.id ? "var(--primary)" : "var(--foreground)",
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== tab.id) e.currentTarget.style.background = "var(--sidebar-hover)";
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== tab.id) e.currentTarget.style.background = "transparent";
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        {/* 탭 콘텐츠 */}
        <div className="flex-1 px-6 py-6 max-w-3xl">
          {activeTab === "profile" && <ProfileTab />}
          {activeTab === "theme" && <ThemeTab />}
          {activeTab === "data" && <DataTab workspaceId={workspaceId} />}
          {activeTab === "notifications" && <NotificationsTab />}
          {activeTab === "version" && <VersionTab />}
          {activeTab === "opensource" && <OpenSourceTab />}
        </div>
      </div>
    </div>
  );
}

// ── 탭 1: 프로필 ──────────────────────────────────────────────

function ProfileTab() {
  const { data: session, update: updateSession } = useSession();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/profile");
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
          setName(data.name || "");
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSaveName() {
    if (!name.trim()) return;
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        setSaveMsg("저장되었습니다");
        // Update session so sidebar reflects new name
        await updateSession({ name: data.name });
        setTimeout(() => setSaveMsg(""), 2000);
      } else {
        const err = await res.json();
        setSaveMsg(err.error || "저장 실패");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" style={{ color: "var(--muted)" }}>
        <Loader2 size={20} className="animate-spin" />
        <span className="ml-2 text-sm">불러오는 중...</span>
      </div>
    );
  }

  const initial = (profile?.name || profile?.email || "?").charAt(0).toUpperCase();
  const createdAt = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "-";

  return (
    <div className="space-y-4">
      <Section title="프로필">
        {/* 아바타 */}
        <div className="flex items-center gap-4 mb-6">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold shrink-0"
            style={{ background: "var(--primary)", color: "white" }}
          >
            {initial}
          </div>
          <div>
            <div className="font-medium text-lg">{profile?.name || "이름 없음"}</div>
            <div className="text-sm" style={{ color: "var(--muted)" }}>
              아바타 이미지 업로드는 추후 지원 예정입니다
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {/* 이름 수정 */}
          <div
            className="rounded-lg p-4"
            style={{ border: "1px solid var(--border)", background: "var(--sidebar-bg)" }}
          >
            <label className="text-sm font-medium block mb-2">이름</label>
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                className="flex-1 px-3 py-2 rounded-md text-sm bg-transparent outline-none"
                style={{ border: "1px solid var(--border)" }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveName();
                }}
              />
              <button
                onClick={handleSaveName}
                disabled={saving || !name.trim() || name.trim() === profile?.name}
                className="px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                style={{
                  background: "var(--primary)",
                  color: "white",
                }}
              >
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
            {saveMsg && (
              <div
                className="text-xs mt-2"
                style={{ color: saveMsg === "저장되었습니다" ? "var(--primary)" : "#ef4444" }}
              >
                {saveMsg}
              </div>
            )}
          </div>

          {/* 이메일 (읽기 전용) */}
          <Field label="이메일" description="이메일은 변경할 수 없습니다">
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              {profile?.email || session?.user?.email || "-"}
            </span>
          </Field>

          {/* 가입 날짜 */}
          <Field label="가입 날짜">
            <span className="text-sm" style={{ color: "var(--muted)" }}>
              {createdAt}
            </span>
          </Field>
        </div>
      </Section>
    </div>
  );
}

// ── 탭 2: 테마 & 외관 ────────────────────────────────────────

function ThemeTab() {
  const [themeMode, setThemeMode] = useState<"system" | "light" | "dark">(() => {
    if (typeof window === "undefined") return "system";
    const stored = localStorage.getItem("theme");
    if (stored === "light") return "light";
    if (stored === "dark") return "dark";
    return "system";
  });

  const [sidebarDefault, setSidebarDefault] = useState<"open" | "collapsed">(() => {
    if (typeof window === "undefined") return "open";
    return (localStorage.getItem("sidebar-default") as "open" | "collapsed") || "open";
  });

  const [fontSize, setFontSize] = useState<number>(() => {
    if (typeof window === "undefined") return 16;
    return parseInt(localStorage.getItem("editor-font-size") || "16", 10);
  });

  function handleThemeChange(mode: "system" | "light" | "dark") {
    setThemeMode(mode);
    if (mode === "system") {
      localStorage.removeItem("theme");
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
    } else {
      localStorage.setItem("theme", mode);
      document.documentElement.setAttribute("data-theme", mode);
    }
  }

  function handleSidebarDefault(val: "open" | "collapsed") {
    setSidebarDefault(val);
    localStorage.setItem("sidebar-default", val);
  }

  function handleFontSize(size: number) {
    setFontSize(size);
    localStorage.setItem("editor-font-size", String(size));
  }

  const themeModes: { id: "system" | "light" | "dark"; label: string; icon: React.ReactNode }[] = [
    { id: "system", label: "시스템", icon: <Monitor size={18} /> },
    { id: "light", label: "라이트", icon: <Sun size={18} /> },
    { id: "dark", label: "다크", icon: <Moon size={18} /> },
  ];

  return (
    <div className="space-y-4">
      <Section title="테마 선택">
        <div className="flex gap-3 flex-wrap">
          {themeModes.map((mode) => (
            <button
              key={mode.id}
              onClick={() => handleThemeChange(mode.id)}
              className="flex items-center gap-2.5 px-5 py-3 rounded-lg text-sm font-medium transition-all"
              style={{
                border:
                  themeMode === mode.id
                    ? "2px solid var(--primary)"
                    : "1px solid var(--border)",
                background: themeMode === mode.id ? "var(--sidebar-bg)" : "transparent",
                color: themeMode === mode.id ? "var(--primary)" : "var(--foreground)",
              }}
            >
              {mode.icon}
              {mode.label}
              {themeMode === mode.id && <Check size={14} />}
            </button>
          ))}
        </div>
      </Section>

      <Section title="사이드바">
        <Field label="사이드바 기본 상태" description="새 창을 열 때 사이드바의 기본 상태">
          <div className="flex gap-2">
            {(["open", "collapsed"] as const).map((val) => (
              <button
                key={val}
                onClick={() => handleSidebarDefault(val)}
                className="px-3 py-1.5 rounded-md text-sm transition-all"
                style={{
                  border:
                    sidebarDefault === val
                      ? "2px solid var(--primary)"
                      : "1px solid var(--border)",
                  background: sidebarDefault === val ? "var(--sidebar-bg)" : "transparent",
                  color: sidebarDefault === val ? "var(--primary)" : "var(--foreground)",
                }}
              >
                {val === "open" ? "열림" : "접힘"}
              </button>
            ))}
          </div>
        </Field>
      </Section>

      <Section title="에디터">
        <Field label="에디터 글꼴 크기" description="에디터에서 사용할 기본 글꼴 크기">
          <div className="flex gap-2">
            {[14, 16, 18].map((size) => (
              <button
                key={size}
                onClick={() => handleFontSize(size)}
                className="px-3 py-1.5 rounded-md text-sm transition-all"
                style={{
                  border:
                    fontSize === size
                      ? "2px solid var(--primary)"
                      : "1px solid var(--border)",
                  background: fontSize === size ? "var(--sidebar-bg)" : "transparent",
                  color: fontSize === size ? "var(--primary)" : "var(--foreground)",
                }}
              >
                {size}px
              </button>
            ))}
          </div>
        </Field>
      </Section>
    </div>
  );
}

// ── 탭 3: 데이터 관리 ────────────────────────────────────────

function DataTab({ workspaceId }: { workspaceId: string }) {
  const [exporting, setExporting] = useState(false);
  const [emptyingTrash, setEmptyingTrash] = useState(false);
  const [stats, setStats] = useState<{ pageCount: number; attachmentCount: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // Fetch page count
        const pagesRes = await fetch(`/api/pages?workspaceId=${workspaceId}&limit=1`);
        let pageCount = 0;
        if (pagesRes.ok) {
          const data = await pagesRes.json();
          pageCount = data.total ?? (Array.isArray(data) ? data.length : 0);
        }
        setStats({ pageCount, attachmentCount: 0 });
      } catch {
        // ignore
      }
    })();
  }, [workspaceId]);

  async function handleExportAll() {
    setExporting(true);
    try {
      // 1. Fetch all pages
      const pagesRes = await fetch(`/api/pages?workspaceId=${workspaceId}&limit=10000`);
      if (!pagesRes.ok) {
        alert("페이지 목록을 가져올 수 없습니다.");
        return;
      }
      const pagesData = await pagesRes.json();
      const pages: { id: string; title: string; slug: string }[] = Array.isArray(pagesData)
        ? pagesData
        : pagesData.pages || [];

      if (pages.length === 0) {
        alert("내보낼 페이지가 없습니다.");
        return;
      }

      // 2. Fetch content for each page
      const files: { name: string; content: string }[] = [];
      for (const page of pages) {
        try {
          const contentRes = await fetch(`/api/pages/${page.id}/content`);
          if (contentRes.ok) {
            const data = await contentRes.json();
            const md = data.markdown || data.content || "";
            const safeName = (page.title || page.slug || page.id)
              .replace(/[/\\?%*:|"<>]/g, "-")
              .slice(0, 100);
            files.push({ name: `${safeName}.md`, content: md });
          }
        } catch {
          // skip failed pages
        }
      }

      if (files.length === 0) {
        alert("내보낼 콘텐츠가 없습니다.");
        return;
      }

      // 3. Create zip using fflate
      const { zipSync, strToU8 } = await import("fflate");
      const zipData: Record<string, Uint8Array> = {};
      for (const file of files) {
        zipData[file.name] = strToU8(file.content);
      }
      const zipped = zipSync(zipData);

      // 4. Download
      const blob = new Blob([new Uint8Array(zipped)], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `jpad-export-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
      alert("내보내기 중 오류가 발생했습니다.");
    } finally {
      setExporting(false);
    }
  }

  function handleImport() {
    window.dispatchEvent(new Event("open-import-modal"));
    // Fallback: also try the sidebar import modal
    window.dispatchEvent(new Event("sidebar:import"));
  }

  async function handleEmptyTrash() {
    if (!confirm("휴지통의 모든 페이지를 영구 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.")) {
      return;
    }
    setEmptyingTrash(true);
    try {
      // Get all trash items and delete each
      const trashRes = await fetch(`/api/trash?workspaceId=${workspaceId}`);
      if (trashRes.ok) {
        const items: { id: string }[] = await trashRes.json();
        for (const item of items) {
          await fetch(`/api/trash/${item.id}`, { method: "DELETE" });
        }
        alert(`${items.length}개 페이지가 영구 삭제되었습니다.`);
        window.dispatchEvent(new Event("sidebar:refresh"));
      }
    } catch {
      alert("휴지통 비우기 중 오류가 발생했습니다.");
    } finally {
      setEmptyingTrash(false);
    }
  }

  return (
    <div className="space-y-4">
      <Section title="내보내기 & 가져오기">
        <div className="space-y-3">
          <Field label="전체 내보내기" description="모든 문서를 마크다운(.md)으로 내보내기">
            <button
              onClick={handleExportAll}
              disabled={exporting}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              style={{ background: "var(--primary)", color: "white" }}
            >
              {exporting ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              {exporting ? "내보내는 중..." : "ZIP으로 내보내기"}
            </button>
          </Field>

          <Field label="가져오기" description="마크다운 파일을 가져옵니다">
            <button
              onClick={handleImport}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors"
              style={{ border: "1px solid var(--border)" }}
            >
              <Upload size={14} />
              마크다운 가져오기
            </button>
          </Field>
        </div>
      </Section>

      <Section title="휴지통">
        <Field label="휴지통 비우기" description="휴지통에 있는 모든 페이지를 영구 삭제합니다">
          <button
            onClick={handleEmptyTrash}
            disabled={emptyingTrash}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            style={{ color: "#ef4444", border: "1px solid #ef4444" }}
          >
            {emptyingTrash ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Trash2 size={14} />
            )}
            {emptyingTrash ? "삭제 중..." : "전체 비우기"}
          </button>
        </Field>
      </Section>

      <Section title="스토리지 사용량">
        <div
          className="rounded-lg p-4 space-y-2"
          style={{ border: "1px solid var(--border)", background: "var(--sidebar-bg)" }}
        >
          <div className="flex justify-between text-sm">
            <span style={{ color: "var(--muted)" }}>페이지 수</span>
            <span className="font-medium">{stats?.pageCount ?? "-"}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: "var(--muted)" }}>첨부파일 수</span>
            <span className="font-medium">{stats?.attachmentCount ?? "-"}</span>
          </div>
        </div>
      </Section>
    </div>
  );
}

// ── 탭 4: 알림 설정 ──────────────────────────────────────────

function NotificationsTab() {
  const [pollInterval, setPollInterval] = useState<number>(() => {
    if (typeof window === "undefined") return 30;
    return parseInt(localStorage.getItem("notification-poll-interval") || "30", 10);
  });

  const [desktopPermission, setDesktopPermission] = useState<NotificationPermission | "unsupported">(
    () => {
      if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
      return Notification.permission;
    }
  );

  function handlePollInterval(val: number) {
    setPollInterval(val);
    localStorage.setItem("notification-poll-interval", String(val));
  }

  async function handleRequestDesktopPermission() {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setDesktopPermission(result);
  }

  const intervals = [
    { value: 15, label: "15초" },
    { value: 30, label: "30초" },
    { value: 60, label: "60초" },
    { value: 0, label: "끄기" },
  ];

  return (
    <div className="space-y-4">
      <Section title="알림 폴링">
        <Field label="알림 확인 간격" description="새로운 알림을 확인하는 주기를 설정합니다">
          <div className="flex gap-2 flex-wrap">
            {intervals.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handlePollInterval(opt.value)}
                className="px-3 py-1.5 rounded-md text-sm transition-all"
                style={{
                  border:
                    pollInterval === opt.value
                      ? "2px solid var(--primary)"
                      : "1px solid var(--border)",
                  background: pollInterval === opt.value ? "var(--sidebar-bg)" : "transparent",
                  color: pollInterval === opt.value ? "var(--primary)" : "var(--foreground)",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>
      </Section>

      <Section title="이메일 알림">
        <div
          className="rounded-lg p-4"
          style={{ border: "1px solid var(--border)", background: "var(--sidebar-bg)" }}
        >
          <div className="text-sm font-medium">이메일 알림</div>
          <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            추후 지원 예정입니다.
          </div>
        </div>
      </Section>

      <Section title="데스크톱 알림">
        <Field
          label="데스크톱 알림"
          description={
            desktopPermission === "unsupported"
              ? "이 브라우저에서는 데스크톱 알림을 지원하지 않습니다"
              : desktopPermission === "granted"
              ? "데스크톱 알림이 허용되었습니다"
              : desktopPermission === "denied"
              ? "데스크톱 알림이 차단되었습니다. 브라우저 설정에서 허용해주세요."
              : "브라우저 알림 권한을 요청합니다"
          }
        >
          <button
            onClick={handleRequestDesktopPermission}
            disabled={desktopPermission === "granted" || desktopPermission === "unsupported"}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
            style={{ border: "1px solid var(--border)" }}
          >
            <Bell size={14} />
            {desktopPermission === "granted" ? "허용됨" : "권한 요청"}
          </button>
        </Field>
      </Section>
    </div>
  );
}

// ── 탭 5: 버전 & 업데이트 ────────────────────────────────────

function VersionTab() {
  const [checking, setChecking] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<{
    latest: string;
    isUpToDate: boolean;
    url?: string;
  } | null>(null);

  async function handleCheckUpdate() {
    setChecking(true);
    setUpdateInfo(null);
    try {
      // 먼저 releases/latest 시도, 실패 시 tags API로 fallback
      let latestTag = "";
      let releaseUrl: string | undefined;

      const relRes = await fetch("https://api.github.com/repos/jhl-labs/jpad-web/releases/latest");
      if (relRes.ok) {
        const data = await relRes.json();
        latestTag = (data.tag_name || "").replace(/^v/, "");
        releaseUrl = data.html_url;
      } else {
        // fallback: tags API
        const tagRes = await fetch("https://api.github.com/repos/jhl-labs/jpad-web/tags?per_page=1");
        if (tagRes.ok) {
          const tags = await tagRes.json();
          if (tags.length > 0) {
            latestTag = (tags[0].name || "").replace(/^v/, "");
          }
        }
      }

      const isUpToDate = latestTag === APP_VERSION || !latestTag;
      setUpdateInfo({
        latest: latestTag || "알 수 없음",
        isUpToDate,
        url: releaseUrl,
      });
    } catch {
      setUpdateInfo({ latest: "확인 실패", isUpToDate: true });
    } finally {
      setChecking(false);
    }
  }

  const techStack = [
    { name: "Next.js", version: "15.5.12" },
    { name: "React", version: "19.2.4" },
    { name: "Prisma", version: "6.19.2" },
    { name: "BlockNote", version: "0.47.1" },
    { name: "TypeScript", version: "5.9.3" },
  ];

  return (
    <div className="space-y-4">
      <Section title="현재 버전">
        <div
          className="rounded-lg p-4"
          style={{ border: "1px solid var(--border)", background: "var(--sidebar-bg)" }}
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-bold">jpad v{APP_VERSION}</div>
              <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                AI 기반 협업 위키 플랫폼
              </div>
            </div>
            <button
              onClick={handleCheckUpdate}
              disabled={checking}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
              style={{ border: "1px solid var(--border)" }}
            >
              {checking ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              {checking ? "확인 중..." : "업데이트 확인"}
            </button>
          </div>

          {updateInfo && (
            <div
              className="mt-3 p-3 rounded-md text-sm"
              style={{
                background: updateInfo.isUpToDate ? "transparent" : "#fef3c7",
                border: "1px solid var(--border)",
                color: updateInfo.isUpToDate ? "var(--foreground)" : "#92400e",
              }}
            >
              {updateInfo.isUpToDate ? (
                <div className="flex items-center gap-2">
                  <Check size={14} style={{ color: "var(--primary)" }} />
                  최신 버전입니다
                </div>
              ) : (
                <div>
                  <div className="font-medium">
                    새 버전 v{updateInfo.latest}가 있습니다
                  </div>
                  {updateInfo.url && (
                    <a
                      href={updateInfo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 mt-1 text-xs underline"
                    >
                      릴리스 노트 보기 <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-4 mt-3">
            <a
              href="https://github.com/jhl-labs/jpad-web/releases"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm underline"
              style={{ color: "var(--primary)" }}
            >
              릴리스 노트 보기 <ExternalLink size={12} />
            </a>
            <a
              href="https://github.com/jhl-labs/jpad-web/blob/master/CHANGELOG.md"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm underline"
              style={{ color: "var(--primary)" }}
            >
              변경 로그 보기 <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </Section>

      <Section title="빌드 정보">
        <div
          className="rounded-lg p-4 space-y-2"
          style={{ border: "1px solid var(--border)", background: "var(--sidebar-bg)" }}
        >
          <div className="flex justify-between text-sm">
            <span style={{ color: "var(--muted)" }}>런타임</span>
            <span className="font-medium">Bun / Node.js</span>
          </div>
          <div className="flex justify-between text-sm">
            <span style={{ color: "var(--muted)" }}>Next.js</span>
            <span className="font-medium">15.5.12</span>
          </div>
        </div>
      </Section>

      <Section title="기술 스택">
        <div
          className="rounded-lg overflow-hidden"
          style={{ border: "1px solid var(--border)" }}
        >
          {techStack.map((tech, idx) => (
            <div
              key={tech.name}
              className="flex items-center justify-between px-4 py-3 text-sm"
              style={{
                borderTop: idx > 0 ? "1px solid var(--border)" : undefined,
                background: idx % 2 === 0 ? "transparent" : "var(--sidebar-bg)",
              }}
            >
              <span className="font-medium">{tech.name}</span>
              <span style={{ color: "var(--muted)" }}>v{tech.version}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ── 탭 6: 오픈소스 고지 ──────────────────────────────────────

function OpenSourceTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold mb-1">오픈소스 소프트웨어 고지</h2>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          jpad은 아래의 오픈소스 소프트웨어를 사용하여 만들어졌습니다.
        </p>
      </div>

      {dependencyCategories.map((category) => (
        <section key={category.label}>
          <h3
            className="text-sm font-semibold uppercase tracking-wider mb-3 px-1"
            style={{ color: "var(--muted)" }}
          >
            {category.label}
          </h3>
          <div
            className="rounded-lg overflow-hidden"
            style={{ border: "1px solid var(--border)" }}
          >
            {category.dependencies.map((dep, idx) => (
              <div
                key={dep.name}
                className="flex items-center gap-3 px-4 py-3 text-sm"
                style={{
                  borderTop: idx > 0 ? "1px solid var(--border)" : undefined,
                  background: idx % 2 === 0 ? "transparent" : "var(--sidebar-bg)",
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{dep.name}</div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    v{dep.version}
                  </div>
                </div>
                <LicenseBadge license={dep.license} />
                <a
                  href={dep.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded hover:opacity-70 shrink-0"
                  style={{ color: "var(--muted)" }}
                  title="프로젝트 페이지"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            ))}
          </div>
        </section>
      ))}

      {/* 하단 안내 */}
      <div
        className="rounded-lg p-4 text-sm"
        style={{
          background: "var(--sidebar-bg)",
          border: "1px solid var(--border)",
          color: "var(--muted)",
        }}
      >
        이 소프트웨어는 위 오픈소스 소프트웨어를 사용합니다. 각 라이선스의 전문은
        해당 프로젝트의 저장소에서 확인하실 수 있습니다. MPL-2.0 라이선스
        컴포넌트의 소스 코드는 해당 프로젝트 링크에서 확인할 수 있습니다.
      </div>
    </div>
  );
}
