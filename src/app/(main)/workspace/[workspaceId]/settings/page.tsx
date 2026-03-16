"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Globe,
  Lock,
  Save,
  Settings,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Shield,
  Crown,
  Wrench,
  Edit3,
  Eye,
  RefreshCw,
} from "lucide-react";
import { WorkspaceAiSettingsTab } from "@/components/workspace/WorkspaceAiSettingsTab";

interface WorkspaceData {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: string;
  publicWikiEnabled: boolean;
  currentRole: string;
  members: {
    id: string;
    role: string;
    managedByScim?: boolean;
    hasScimProvisionedAccess?: boolean;
    userId: string;
    user: { id: string; name: string; email: string };
  }[];
}

interface AuditLogEntry {
  id: string;
  action: string;
  status: "success" | "denied" | "error";
  requestId: string | null;
  actorEmail: string | null;
  actorName: string | null;
  actorRole: string | null;
  targetId: string | null;
  targetType: string | null;
  pageId: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
}

interface RetentionRunEntry {
  id: string;
  retentionRunId: string;
  mode: "dry_run" | "execute";
  trigger: string;
  status: "running" | "success" | "error";
  startedAt: string;
  finishedAt: string | null;
  summary: {
    purgedPageCount: number;
    purgedAttachmentCount: number;
    purgedShareLinkCount: number;
    purgedAiChatCount: number;
    purgedAuditLogCount: number;
  };
}

const ROLE_LABELS: Record<string, string> = {
  owner: "소유자",
  admin: "관리자",
  maintainer: "메인테이너",
  editor: "편집자",
  viewer: "뷰어",
};

const ROLE_ICONS: Record<string, React.ReactNode> = {
  owner: <Crown size={14} />,
  admin: <Shield size={14} />,
  maintainer: <Wrench size={14} />,
  editor: <Edit3 size={14} />,
  viewer: <Eye size={14} />,
};

const ROLE_COLORS: Record<string, string> = {
  owner: "rgba(245,158,11,0.9)",
  admin: "rgba(239,68,68,0.9)",
  maintainer: "rgba(139,92,246,0.9)",
  editor: "rgba(59,130,246,0.9)",
  viewer: "rgba(107,114,128,0.9)",
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  "workspace.member.invited": "멤버 초대",
  "workspace.member.removed": "멤버 제거",
  "workspace.member.provisioned_by_scim": "SCIM 멤버 프로비저닝",
  "workspace.member.scim_role_updated": "SCIM 멤버 역할 변경",
  "workspace.member.deprovisioned_by_scim": "SCIM 멤버 제거",
  "workspace.updated": "워크스페이스 수정",
  "workspace.deleted": "워크스페이스 삭제",
  "workspace.settings.updated": "설정 변경",
  "page.share.created": "공유 링크 생성",
  "page.share.revoked": "공유 링크 폐기",
  "page.permissions.updated": "페이지 권한 변경",
  "attachment.uploaded": "첨부 업로드",
  "attachment.upload.blocked": "첨부 업로드 차단",
  "attachment.security.rescanned": "첨부 보안 재검사",
  "attachment.quarantined": "첨부 격리",
  "attachment.quarantine.released": "첨부 격리 해제",
  "attachment.quarantine.reblocked": "첨부 다시 격리",
  "attachment.deleted": "첨부 삭제",
  "page.restored": "페이지 복원",
  "page.deleted.permanently": "페이지 영구 삭제",
  "ai.write.completed": "AI 작성",
  "ai.chat.completed": "AI 채팅",
  "ai.summary.completed": "AI 요약",
  "ai.autocomplete.completed": "AI 이어쓰기",
  "search.reindex.executed": "검색 재색인",
  "search.index_jobs.processed": "인덱싱 큐 처리",
  "search.index_worker.executed": "인덱싱 워커 실행",
  "retention.executed": "Retention 실행",
  "organization.scim_group_mapping.created": "SCIM 그룹 매핑 생성",
  "organization.scim_group_mapping.deleted": "SCIM 그룹 매핑 삭제",
};

const AUDIT_ACTION_OPTIONS = [
  "workspace.member.invited",
  "workspace.member.removed",
  "workspace.member.provisioned_by_scim",
  "workspace.member.scim_role_updated",
  "workspace.member.deprovisioned_by_scim",
  "workspace.updated",
  "workspace.settings.updated",
  "page.share.created",
  "page.share.revoked",
  "page.permissions.updated",
  "attachment.uploaded",
  "attachment.upload.blocked",
  "attachment.security.rescanned",
  "attachment.quarantined",
  "attachment.quarantine.released",
  "attachment.quarantine.reblocked",
  "attachment.deleted",
  "page.restored",
  "page.deleted.permanently",
  "ai.write.completed",
  "ai.chat.completed",
  "ai.summary.completed",
  "ai.autocomplete.completed",
  "search.reindex.executed",
  "search.index_jobs.processed",
  "search.index_worker.executed",
  "retention.executed",
  "organization.scim_group_mapping.created",
  "organization.scim_group_mapping.deleted",
];

type Tab = "general" | "members" | "ai" | "audit";

export default function WorkspaceSettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("general");
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // General form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("private");
  const [publicWikiEnabled, setPublicWikiEnabled] = useState(false);

  // Members form
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [inviteError, setInviteError] = useState("");

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [auditQuery, setAuditQuery] = useState("");
  const [auditQueryInput, setAuditQueryInput] = useState("");
  const [auditAction, setAuditAction] = useState("all");
  const [auditStatus, setAuditStatus] = useState("all");
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [auditExporting, setAuditExporting] = useState(false);
  const [retentionRuns, setRetentionRuns] = useState<RetentionRunEntry[]>([]);
  const [retentionLoading, setRetentionLoading] = useState(false);
  const [retentionError, setRetentionError] = useState("");
  const [retentionStatus, setRetentionStatus] = useState("all");
  const [retentionMode, setRetentionMode] = useState("all");
  const [retentionPage, setRetentionPage] = useState(1);
  const [retentionTotalPages, setRetentionTotalPages] = useState(1);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  const fetchWorkspace = useCallback(async () => {
    const res = await fetch(`/api/workspaces/${workspaceId}`);
    if (res.ok) {
      const data = await res.json();
      setWorkspace(data);
      setName(data.name);
      setDescription(data.description || "");
      setVisibility(data.visibility || "private");
      setPublicWikiEnabled(data.publicWikiEnabled);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  const canManage = workspace?.currentRole === "owner" || workspace?.currentRole === "admin";
  const isOwner = workspace?.currentRole === "owner";

  const fetchAuditLogs = useCallback(
    async (
      nextPage = 1,
      filters?: { query?: string; action?: string; status?: string }
    ) => {
      setAuditLoading(true);
      setAuditError("");

      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          limit: "20",
        });
        const query = filters?.query ?? auditQuery;
        const action = filters?.action ?? auditAction;
        const status = filters?.status ?? auditStatus;

        if (query.trim()) {
          params.set("q", query.trim());
        }
        if (action !== "all") {
          params.set("action", action);
        }
        if (status !== "all") {
          params.set("status", status);
        }

        const res = await fetch(
          `/api/workspaces/${workspaceId}/audit-logs?${params.toString()}`
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setAuditError(data.error || "감사 로그를 불러오지 못했습니다.");
          return;
        }

        const data = (await res.json()) as {
          data: AuditLogEntry[];
          pagination: { page: number; totalPages: number };
        };
        setAuditLogs(data.data);
        setAuditPage(data.pagination.page);
        setAuditTotalPages(Math.max(1, data.pagination.totalPages));
      } finally {
        setAuditLoading(false);
      }
    },
    [auditAction, auditQuery, auditStatus, workspaceId]
  );

  const fetchRetentionRuns = useCallback(
    async (
      nextPage = 1,
      filters?: { status?: string; mode?: string }
    ) => {
      setRetentionLoading(true);
      setRetentionError("");

      try {
        const params = new URLSearchParams({
          page: String(nextPage),
          limit: "10",
        });
        const status = filters?.status ?? retentionStatus;
        const mode = filters?.mode ?? retentionMode;

        if (status !== "all") {
          params.set("status", status);
        }
        if (mode !== "all") {
          params.set("mode", mode);
        }

        const res = await fetch(
          `/api/workspaces/${workspaceId}/retention-runs?${params.toString()}`
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setRetentionError(data.error || "Retention 실행 이력을 불러오지 못했습니다.");
          return;
        }

        const data = (await res.json()) as {
          data: RetentionRunEntry[];
          pagination: { page: number; totalPages: number };
        };
        setRetentionRuns(data.data);
        setRetentionPage(data.pagination.page);
        setRetentionTotalPages(Math.max(1, data.pagination.totalPages));
      } finally {
        setRetentionLoading(false);
      }
    },
    [retentionMode, retentionStatus, workspaceId]
  );

  useEffect(() => {
    if (tab === "audit" && canManage) {
      fetchAuditLogs(1);
      fetchRetentionRuns(1);
    }
  }, [tab, canManage, fetchAuditLogs, fetchRetentionRuns]);

  async function saveGeneral() {
    setSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, visibility, publicWikiEnabled }),
      });
      if (res.ok) {
        showToast("저장되었습니다");
        fetchWorkspace();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleInvite() {
    setInviteError("");
    if (!inviteEmail.trim()) return;
    const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    if (res.ok) {
      setInviteEmail("");
      showToast("멤버가 추가되었습니다");
      fetchWorkspace();
    } else {
      const data = await res.json();
      setInviteError(data.error || "초대 실패");
    }
  }

  async function handleRoleChange(memberId: string, newRole: string) {
    const res = await fetch(
      `/api/workspaces/${workspaceId}/members/${memberId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      }
    );
    if (res.ok) {
      showToast("역할이 변경되었습니다");
      fetchWorkspace();
    } else {
      const data = await res.json();
      showToast(data.error || "역할 변경 실패");
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!confirm("이 멤버를 제거하시겠습니까?")) return;
    const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      showToast("멤버가 제거되었습니다");
      fetchWorkspace();
    }
  }

  async function handleDeleteWorkspace() {
    if (!confirm("정말로 이 워크스페이스를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.")) return;
    const res = await fetch(`/api/workspaces/${workspaceId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/workspace");
    }
  }

  function handleAuditSearch() {
    const nextQuery = auditQueryInput.trim();
    setAuditQuery(nextQuery);
    fetchAuditLogs(1, { query: nextQuery });
  }

  async function handleAuditExport(format: "ndjson" | "csv" = "ndjson") {
    setAuditExporting(true);

    try {
      const params = new URLSearchParams({ format, limit: "5000" });
      if (auditQuery.trim()) {
        params.set("q", auditQuery.trim());
      }
      if (auditAction !== "all") {
        params.set("action", auditAction);
      }
      if (auditStatus !== "all") {
        params.set("status", auditStatus);
      }

      const res = await fetch(
        `/api/workspaces/${workspaceId}/audit-logs/export?${params.toString()}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "감사 로그를 내보내지 못했습니다.");
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${workspace?.slug || workspaceId}-audit-logs.${
        format === "csv" ? "csv" : "ndjson"
      }`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      showToast(`감사 로그를 ${format.toUpperCase()}로 내보냈습니다`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "감사 로그 내보내기 실패");
    } finally {
      setAuditExporting(false);
    }
  }

  function formatDateTime(value: string) {
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(value));
  }

  function getAuditActionLabel(action: string) {
    return AUDIT_ACTION_LABELS[action] || action;
  }

  function getRetentionModeLabel(mode: RetentionRunEntry["mode"]) {
    return mode === "dry_run" ? "Dry Run" : "실행";
  }

  if (!workspace) return null;

  if (!canManage) {
    return (
      <div className="flex items-center justify-center h-full">
        <p style={{ color: "var(--muted)" }}>설정에 접근할 권한이 없습니다.</p>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "general", label: "일반", icon: <Settings size={16} /> },
    { id: "members", label: "멤버 관리", icon: <Users size={16} /> },
    { id: "ai", label: "AI / 고급 설정", icon: <Sparkles size={16} /> },
    { id: "audit", label: "감사 로그", icon: <Activity size={16} /> },
  ];

  return (
    <div className="max-w-3xl mx-auto p-6 md:p-10">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => router.push(`/workspace/${workspaceId}`)}
          className="p-2 rounded hover:opacity-70"
          style={{ color: "var(--muted)" }}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold">워크스페이스 설정</h1>
        <span
          className="text-xs px-2 py-0.5 rounded"
          style={{ background: "var(--sidebar-hover)", color: "var(--muted)" }}
        >
          {ROLE_LABELS[workspace.currentRole]}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8" style={{ borderBottom: "1px solid var(--border)" }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors"
            style={{
              borderBottom: tab === t.id ? "2px solid var(--primary)" : "2px solid transparent",
              color: tab === t.id ? "var(--foreground)" : "var(--muted)",
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg text-sm text-white"
          style={{ background: "rgba(34,197,94,0.9)" }}
        >
          {toast}
        </div>
      )}

      {/* General Tab */}
      {tab === "general" && (
        <div className="space-y-6">
          <Section title="기본 정보">
            <Field label="워크스페이스 이름">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded text-sm"
                style={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)" }}
              />
            </Field>
            <Field label="설명 (선택)">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded text-sm resize-none"
                style={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)" }}
                placeholder="워크스페이스에 대한 설명을 입력하세요"
              />
            </Field>
          </Section>

          <Section title="가시성">
            <div className="flex gap-3">
              <button
                onClick={() => setVisibility("private")}
                className="flex-1 flex items-center gap-3 p-4 rounded-lg text-left transition-colors"
                style={{
                  border: visibility === "private" ? "2px solid var(--primary)" : "1px solid var(--border)",
                  background: visibility === "private" ? "var(--sidebar-hover)" : "transparent",
                }}
              >
                <Lock size={20} style={{ color: "var(--muted)" }} />
                <div>
                  <div className="font-medium text-sm">Private</div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    초대된 멤버만 접근 가능
                  </div>
                </div>
              </button>
              <button
                onClick={() => { setVisibility("public"); setPublicWikiEnabled(true); }}
                className="flex-1 flex items-center gap-3 p-4 rounded-lg text-left transition-colors"
                style={{
                  border: visibility === "public" ? "2px solid var(--primary)" : "1px solid var(--border)",
                  background: visibility === "public" ? "var(--sidebar-hover)" : "transparent",
                }}
              >
                <Globe size={20} style={{ color: "var(--muted)" }} />
                <div>
                  <div className="font-medium text-sm">Public</div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    누구나 위키를 열람 가능 (편집은 멤버만)
                  </div>
                </div>
              </button>
            </div>

            {visibility === "private" && (
              <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={publicWikiEnabled}
                  onChange={(e) => setPublicWikiEnabled(e.target.checked)}
                />
                공개 위키 활성화 (비로그인 사용자도 위키 페이지 열람 가능)
              </label>
            )}
          </Section>

          <div className="flex items-center justify-between pt-4" style={{ borderTop: "1px solid var(--border)" }}>
            <button
              onClick={saveGeneral}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded text-sm text-white"
              style={{ background: "var(--primary)" }}
            >
              <Save size={14} /> {saving ? "저장 중..." : "저장"}
            </button>
            {isOwner && (
              <button
                onClick={handleDeleteWorkspace}
                className="flex items-center gap-2 px-4 py-2 rounded text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 size={14} /> 워크스페이스 삭제
              </button>
            )}
          </div>
        </div>
      )}

      {/* Members Tab */}
      {tab === "members" && (
        <div className="space-y-6">
          <Section title="멤버 초대">
            <div className="flex gap-2">
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="이메일 주소"
                className="flex-1 px-3 py-2 rounded text-sm"
                style={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)" }}
                onKeyDown={(e) => e.key === "Enter" && handleInvite()}
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="px-3 py-2 rounded text-sm"
                style={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)" }}
              >
                {workspace.currentRole === "owner" && <option value="admin">관리자</option>}
                {(workspace.currentRole === "owner" || workspace.currentRole === "admin") && (
                  <option value="maintainer">메인테이너</option>
                )}
                <option value="editor">편집자</option>
                <option value="viewer">뷰어</option>
              </select>
              <button
                onClick={handleInvite}
                className="flex items-center gap-1 px-4 py-2 rounded text-sm text-white"
                style={{ background: "var(--primary)" }}
              >
                <UserPlus size={14} /> 초대
              </button>
            </div>
            {inviteError && (
              <p className="text-sm text-red-500 mt-1">{inviteError}</p>
            )}
          </Section>

          <Section title={`멤버 목록 (${workspace.members.length}명)`}>
            {/* Role legend */}
            <div className="flex flex-wrap gap-3 mb-4 text-xs" style={{ color: "var(--muted)" }}>
              {Object.entries(ROLE_LABELS).map(([role, label]) => (
                <span key={role} className="flex items-center gap-1">
                  <span style={{ color: ROLE_COLORS[role] }}>{ROLE_ICONS[role]}</span>
                  {label}
                </span>
              ))}
            </div>

            <div className="space-y-1">
              {workspace.members
                .sort((a, b) => {
                  const order = ["owner", "admin", "maintainer", "editor", "viewer"];
                  return order.indexOf(a.role) - order.indexOf(b.role);
                })
                .map((m) => {
                  const scimControlled = Boolean(
                    m.managedByScim || m.hasScimProvisionedAccess
                  );

                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded"
                      style={{ background: "var(--sidebar-bg)" }}
                    >
                      <span style={{ color: ROLE_COLORS[m.role] }}>
                        {ROLE_ICONS[m.role]}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate flex items-center gap-2">
                          <span>{m.user.name}</span>
                          {scimControlled && (
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{ background: "rgba(59,130,246,0.1)", color: "rgba(29,78,216,0.9)" }}
                            >
                              SCIM
                            </span>
                          )}
                        </div>
                        <div className="text-xs truncate" style={{ color: "var(--muted)" }}>
                          {m.user.email}
                        </div>
                      </div>

                      {m.role === "owner" ? (
                        <span
                          className="text-xs px-2 py-1 rounded"
                          style={{ background: "rgba(245,158,11,0.1)", color: "rgba(146,64,14,0.9)" }}
                        >
                          소유자
                        </span>
                      ) : scimControlled ? (
                        <span
                          className="text-xs px-2 py-1 rounded"
                          style={{ background: "rgba(59,130,246,0.1)", color: "rgba(29,78,216,0.9)" }}
                        >
                          IdP 관리
                        </span>
                      ) : canManage && m.user.id !== workspace.members.find((x) => x.userId === m.userId)?.userId ? (
                        <>
                          <select
                          value={m.role}
                          onChange={(e) => handleRoleChange(m.id, e.target.value)}
                          className="text-xs px-2 py-1 rounded"
                          style={{
                            background: "var(--background)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          {isOwner && <option value="admin">관리자</option>}
                          <option value="maintainer">메인테이너</option>
                          <option value="editor">편집자</option>
                          <option value="viewer">뷰어</option>
                        </select>
                        <button
                          onClick={() => handleRemoveMember(m.user.id)}
                          className="p-1 rounded text-red-500 hover:bg-red-50"
                          title="멤버 제거"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    ) : (
                        <span
                          className="text-xs px-2 py-1 rounded"
                          style={{ background: "var(--sidebar-hover)", color: ROLE_COLORS[m.role] }}
                        >
                          {ROLE_LABELS[m.role]}
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
          </Section>

          {/* Role permissions matrix */}
          <Section title="역할별 권한">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th className="text-left py-2 pr-4">권한</th>
                    {Object.entries(ROLE_LABELS).map(([role, label]) => (
                      <th key={role} className="text-center py-2 px-2" style={{ color: ROLE_COLORS[role] }}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { name: "워크스페이스 설정 변경", perms: [true, true, false, false, false] },
                    { name: "멤버 초대/제거", perms: [true, true, true, false, false] },
                    { name: "멤버 역할 변경", perms: [true, true, false, false, false] },
                    { name: "모든 페이지 접근", perms: [true, true, true, false, false] },
                    { name: "페이지 생성/편집", perms: [true, true, true, true, false] },
                    { name: "페이지 삭제", perms: [true, true, true, false, false] },
                    { name: "휴지통 관리", perms: [true, true, false, false, false] },
                    { name: "페이지 열람", perms: [true, true, true, true, true] },
                    { name: "AI 기능 사용", perms: [true, true, true, true, false] },
                    { name: "워크스페이스 삭제", perms: [true, false, false, false, false] },
                  ].map((row) => (
                    <tr key={row.name} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="py-2 pr-4">{row.name}</td>
                      {row.perms.map((p, i) => (
                        <td key={i} className="text-center py-2 px-2">
                          {p ? (
                            <span style={{ color: "#22c55e" }}>&#10003;</span>
                          ) : (
                            <span style={{ color: "var(--muted)" }}>&#8212;</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}

      {/* AI / Advanced Settings Tab */}
      {tab === "ai" && (
        <WorkspaceAiSettingsTab
          workspaceId={workspaceId}
          isOwner={isOwner}
          showToast={showToast}
        />
      )}

      {tab === "audit" && (
        <div className="space-y-6">
          <Section title="Retention 실행 이력">
            <div className="grid gap-3 md:grid-cols-[180px_180px_auto]">
              <select
                value={retentionStatus}
                onChange={(e) => {
                  const nextStatus = e.target.value;
                  setRetentionStatus(nextStatus);
                  fetchRetentionRuns(1, { status: nextStatus });
                }}
                className="px-3 py-2 rounded text-sm"
                style={{
                  background: "var(--sidebar-bg)",
                  border: "1px solid var(--border)",
                }}
              >
                <option value="all">전체 상태</option>
                <option value="running">실행 중</option>
                <option value="success">성공</option>
                <option value="error">오류</option>
              </select>
              <select
                value={retentionMode}
                onChange={(e) => {
                  const nextMode = e.target.value;
                  setRetentionMode(nextMode);
                  fetchRetentionRuns(1, { mode: nextMode });
                }}
                className="px-3 py-2 rounded text-sm"
                style={{
                  background: "var(--sidebar-bg)",
                  border: "1px solid var(--border)",
                }}
              >
                <option value="all">전체 모드</option>
                <option value="execute">실행</option>
                <option value="dry_run">Dry Run</option>
              </select>
              <div className="text-xs self-center" style={{ color: "var(--muted)" }}>
                워크스페이스에 실제 영향을 준 retention 실행만 표시합니다.
              </div>
            </div>

            {retentionError && (
              <p className="text-sm text-red-500">{retentionError}</p>
            )}

            {retentionLoading ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Retention 실행 이력을 불러오는 중입니다...
              </p>
            ) : retentionRuns.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                아직 표시할 retention 실행 이력이 없습니다.
              </p>
            ) : (
              <div className="space-y-3">
                {retentionRuns.map((run) => (
                  <div
                    key={run.id}
                    className="rounded-lg p-4"
                    style={{
                      background: "var(--sidebar-bg)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">
                          {getRetentionModeLabel(run.mode)} / {run.trigger}
                        </div>
                        <div
                          className="text-xs mt-1 flex flex-wrap gap-2"
                          style={{ color: "var(--muted)" }}
                        >
                          <span>시작: {formatDateTime(run.startedAt)}</span>
                          <span>
                            완료: {run.finishedAt ? formatDateTime(run.finishedAt) : "-"}
                          </span>
                          <span>실행 ID: {run.retentionRunId}</span>
                        </div>
                      </div>
                      <span
                        className="text-xs px-2 py-1 rounded"
                        style={{
                          background:
                            run.status === "success"
                              ? "rgba(34,197,94,0.1)"
                              : run.status === "running"
                                ? "rgba(59,130,246,0.1)"
                                : "rgba(239,68,68,0.1)",
                          color:
                            run.status === "success"
                              ? "rgba(22,101,52,0.9)"
                              : run.status === "running"
                                ? "rgba(29,78,216,0.9)"
                                : "rgba(153,27,27,0.9)",
                        }}
                      >
                        {run.status === "success"
                          ? "성공"
                          : run.status === "running"
                            ? "실행 중"
                            : "오류"}
                      </span>
                    </div>

                    <div
                      className="grid gap-2 mt-3 text-xs md:grid-cols-3"
                      style={{ color: "var(--muted)" }}
                    >
                      <div>페이지: <span style={{ color: "var(--foreground)" }}>{run.summary.purgedPageCount}</span></div>
                      <div>첨부: <span style={{ color: "var(--foreground)" }}>{run.summary.purgedAttachmentCount}</span></div>
                      <div>공유 링크: <span style={{ color: "var(--foreground)" }}>{run.summary.purgedShareLinkCount}</span></div>
                      <div>AI 대화: <span style={{ color: "var(--foreground)" }}>{run.summary.purgedAiChatCount}</span></div>
                      <div>감사 로그: <span style={{ color: "var(--foreground)" }}>{run.summary.purgedAuditLogCount}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div
              className="flex items-center justify-between pt-2"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                페이지 {retentionPage} / {retentionTotalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchRetentionRuns(retentionPage - 1)}
                  disabled={retentionPage <= 1 || retentionLoading}
                  className="px-3 py-1.5 rounded text-xs"
                  style={{
                    background: "var(--sidebar-bg)",
                    border: "1px solid var(--border)",
                    opacity: retentionPage <= 1 || retentionLoading ? 0.5 : 1,
                  }}
                >
                  이전
                </button>
                <button
                  onClick={() => fetchRetentionRuns(retentionPage + 1)}
                  disabled={retentionPage >= retentionTotalPages || retentionLoading}
                  className="px-3 py-1.5 rounded text-xs"
                  style={{
                    background: "var(--sidebar-bg)",
                    border: "1px solid var(--border)",
                    opacity:
                      retentionPage >= retentionTotalPages || retentionLoading ? 0.5 : 1,
                  }}
                >
                  다음
                </button>
              </div>
            </div>
          </Section>

          <Section title="감사 로그 검색">
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.5fr)_180px_220px_auto_auto]">
              <input
                value={auditQueryInput}
                onChange={(e) => setAuditQueryInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAuditSearch()}
                placeholder="이벤트, 사용자, 요청 ID, 대상 ID 검색"
                className="w-full px-3 py-2 rounded text-sm"
                style={{
                  background: "var(--sidebar-bg)",
                  border: "1px solid var(--border)",
                }}
              />
              <select
                value={auditStatus}
                onChange={(e) => {
                  const nextStatus = e.target.value;
                  setAuditStatus(nextStatus);
                  fetchAuditLogs(1, { status: nextStatus });
                }}
                className="px-3 py-2 rounded text-sm"
                style={{
                  background: "var(--sidebar-bg)",
                  border: "1px solid var(--border)",
                }}
              >
                <option value="all">전체 상태</option>
                <option value="success">성공</option>
                <option value="denied">거부</option>
                <option value="error">오류</option>
              </select>
              <select
                value={auditAction}
                onChange={(e) => {
                  const nextAction = e.target.value;
                  setAuditAction(nextAction);
                  fetchAuditLogs(1, { action: nextAction });
                }}
                className="px-3 py-2 rounded text-sm"
                style={{
                  background: "var(--sidebar-bg)",
                  border: "1px solid var(--border)",
                }}
              >
                <option value="all">전체 이벤트</option>
                {AUDIT_ACTION_OPTIONS.map((action) => (
                  <option key={action} value={action}>
                    {getAuditActionLabel(action)}
                  </option>
                ))}
              </select>
              <button
                onClick={handleAuditSearch}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded text-sm text-white"
                style={{ background: "var(--primary)" }}
              >
                <RefreshCw size={14} />
                조회
              </button>
              <button
                onClick={() => void handleAuditExport("ndjson")}
                disabled={auditExporting}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded text-sm"
                style={{
                  background: "var(--sidebar-bg)",
                  border: "1px solid var(--border)",
                  opacity: auditExporting ? 0.7 : 1,
                }}
              >
                <Activity size={14} />
                NDJSON 내보내기
              </button>
            </div>
          </Section>

          <Section title="이벤트 목록">
            {auditError && (
              <p className="text-sm text-red-500">{auditError}</p>
            )}

            {auditLoading ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                감사 로그를 불러오는 중입니다...
              </p>
            ) : auditLogs.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                조건에 맞는 감사 로그가 없습니다.
              </p>
            ) : (
              <div className="space-y-3">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-lg p-4"
                    style={{
                      background: "var(--sidebar-bg)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">
                          {getAuditActionLabel(log.action)}
                        </div>
                        <div
                          className="text-xs mt-1 flex flex-wrap gap-2"
                          style={{ color: "var(--muted)" }}
                        >
                          <span>{formatDateTime(log.createdAt)}</span>
                          <span>
                            {log.actorName || log.actorEmail || "system"}
                          </span>
                          {log.actorRole && (
                            <span>{ROLE_LABELS[log.actorRole] || log.actorRole}</span>
                          )}
                        </div>
                      </div>
                      <span
                        className="text-xs px-2 py-1 rounded"
                        style={{
                          background:
                            log.status === "success"
                              ? "rgba(34,197,94,0.1)"
                              : log.status === "denied"
                                ? "rgba(245,158,11,0.1)"
                                : "rgba(239,68,68,0.1)",
                          color:
                            log.status === "success"
                              ? "rgba(22,101,52,0.9)"
                              : log.status === "denied"
                                ? "rgba(146,64,14,0.9)"
                                : "rgba(153,27,27,0.9)",
                        }}
                      >
                        {log.status === "success"
                          ? "성공"
                          : log.status === "denied"
                            ? "거부"
                            : "오류"}
                      </span>
                    </div>

                    <div
                      className="grid gap-2 mt-3 text-xs md:grid-cols-2"
                      style={{ color: "var(--muted)" }}
                    >
                      <div>
                        대상:{" "}
                        <span style={{ color: "var(--foreground)" }}>
                          {log.targetType || "-"}
                          {log.targetId ? ` / ${log.targetId}` : ""}
                        </span>
                      </div>
                      <div>
                        페이지 ID:{" "}
                        <span style={{ color: "var(--foreground)" }}>
                          {log.pageId || "-"}
                        </span>
                      </div>
                      <div className="md:col-span-2">
                        Request ID:{" "}
                        <code
                          className="px-1.5 py-0.5 rounded"
                          style={{
                            background: "var(--background)",
                            color: "var(--foreground)",
                          }}
                        >
                          {log.requestId || "-"}
                        </code>
                      </div>
                    </div>

                    {log.metadata && (
                      <details className="mt-3">
                        <summary
                          className="text-xs cursor-pointer"
                          style={{ color: "var(--muted)" }}
                        >
                          메타데이터 보기
                        </summary>
                        <pre
                          className="mt-2 text-xs p-3 rounded overflow-x-auto"
                          style={{
                            background: "var(--background)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div
              className="flex items-center justify-between pt-2"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                페이지 {auditPage} / {auditTotalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchAuditLogs(auditPage - 1)}
                  disabled={auditPage <= 1 || auditLoading}
                  className="px-3 py-1.5 rounded text-xs"
                  style={{
                    background: "var(--sidebar-bg)",
                    border: "1px solid var(--border)",
                    opacity: auditPage <= 1 || auditLoading ? 0.5 : 1,
                  }}
                >
                  이전
                </button>
                <button
                  onClick={() => fetchAuditLogs(auditPage + 1)}
                  disabled={auditPage >= auditTotalPages || auditLoading}
                  className="px-3 py-1.5 rounded text-xs"
                  style={{
                    background: "var(--sidebar-bg)",
                    border: "1px solid var(--border)",
                    opacity:
                      auditPage >= auditTotalPages || auditLoading ? 0.5 : 1,
                  }}
                >
                  다음
                </button>
              </div>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>
        {label}
      </label>
      {children}
    </div>
  );
}
