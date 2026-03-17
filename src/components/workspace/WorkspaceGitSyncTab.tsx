"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Save,
  ArrowUpCircle,
  ArrowDownCircle,
  RefreshCw,
  Wifi,
} from "lucide-react";
import { Section, Field } from "@/components/ui/FormLayout";
import { formatDateTime } from "@/lib/utils/dateFormat";
import { getStatusBadgeStyle } from "@/lib/utils/statusStyles";

interface GitSyncSettings {
  gitRemoteUrl: string | null;
  gitRemoteToken: string | null;
  gitRemoteBranch: string;
  gitSyncMode: string | null;
  gitSyncEnabled: boolean;
  gitAutoSyncOnSave: boolean;
  gitWebhookSecret: string | null;
}

interface GitSyncLogEntry {
  id: string;
  direction: string;
  status: string;
  trigger: string;
  errorMessage: string | null;
  filesChanged: number;
  startedAt: string;
  finishedAt: string | null;
}

interface Props {
  workspaceId: string;
  isOwner: boolean;
  showToast: (msg: string) => void;
}

const SYNC_MODE_OPTIONS = [
  { value: "push_only", label: "Push 전용" },
  { value: "pull_only", label: "Pull 전용" },
  { value: "bidirectional", label: "양방향" },
];

export function WorkspaceGitSyncTab({ workspaceId, isOwner, showToast }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<GitSyncSettings>({
    gitRemoteUrl: null,
    gitRemoteToken: null,
    gitRemoteBranch: "main",
    gitSyncMode: null,
    gitSyncEnabled: false,
    gitAutoSyncOnSave: true,
    gitWebhookSecret: null,
  });

  // Form state
  const [remoteUrl, setRemoteUrl] = useState("");
  const [remoteToken, setRemoteToken] = useState("");
  const [remoteBranch, setRemoteBranch] = useState("main");
  const [syncMode, setSyncMode] = useState("push_only");
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [autoSyncOnSave, setAutoSyncOnSave] = useState(true);

  // Action state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);

  // Logs
  const [logs, setLogs] = useState<GitSyncLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(1);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/git-sync`);
      if (res.ok) {
        const data: GitSyncSettings = await res.json();
        setSettings(data);
        setRemoteUrl(data.gitRemoteUrl || "");
        setRemoteToken("");
        setRemoteBranch(data.gitRemoteBranch || "main");
        setSyncMode(data.gitSyncMode || "push_only");
        setSyncEnabled(data.gitSyncEnabled);
        setAutoSyncOnSave(data.gitAutoSyncOnSave);
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const fetchLogs = useCallback(
    async (page: number) => {
      setLogsLoading(true);
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/git-sync/logs?page=${page}&limit=10`
        );
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs);
          setLogsPage(data.page);
          setLogsTotalPages(data.totalPages);
        }
      } finally {
        setLogsLoading(false);
      }
    },
    [workspaceId]
  );

  useEffect(() => {
    fetchSettings();
    fetchLogs(1);
  }, [fetchSettings, fetchLogs]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        gitRemoteUrl: remoteUrl.trim() || null,
        gitRemoteBranch: remoteBranch.trim() || "main",
        gitSyncMode: syncMode,
        gitSyncEnabled: syncEnabled,
        gitAutoSyncOnSave: autoSyncOnSave,
      };

      // Only send token if user typed a new one
      if (remoteToken.trim()) {
        body.gitRemoteToken = remoteToken.trim();
      }

      const res = await fetch(`/api/workspaces/${workspaceId}/git-sync`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setSettings(data);
        setRemoteToken("");
        showToast("Git 동기화 설정이 저장되었습니다.");
      } else {
        const err = await res.json();
        showToast(`저장 실패: ${err.error || "알 수 없는 오류"}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/git-sync/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: remoteUrl.trim(),
          token: remoteToken.trim() || undefined,
        }),
      });

      const data = await res.json();
      setTestResult(data);
    } catch (_error: unknown) {
      setTestResult({ success: false, error: "연결 테스트 요청 실패" });
    } finally {
      setTesting(false);
    }
  };

  const handlePush = async () => {
    setPushing(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/git-sync/push`, {
        method: "POST",
      });

      if (res.ok) {
        showToast("Push 완료!");
        fetchLogs(1);
      } else {
        const err = await res.json();
        showToast(`Push 실패: ${err.error || "알 수 없는 오류"}`);
        fetchLogs(1);
      }
    } finally {
      setPushing(false);
    }
  };

  const handlePull = async () => {
    setPulling(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/git-sync/pull`, {
        method: "POST",
      });

      if (res.ok) {
        showToast("Pull 완료!");
        fetchLogs(1);
      } else {
        const err = await res.json();
        showToast(`Pull 실패: ${err.error || "알 수 없는 오류"}`);
        fetchLogs(1);
      }
    } finally {
      setPulling(false);
    }
  };

  function getDirectionLabel(direction: string) {
    return direction === "push" ? "Push" : "Pull";
  }

  function getTriggerLabel(trigger: string) {
    switch (trigger) {
      case "auto_save":
        return "자동 저장";
      case "manual":
        return "수동";
      case "webhook":
        return "웹훅";
      default:
        return trigger;
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin" size={24} style={{ color: "var(--muted)" }} />
      </div>
    );
  }

  const canPush =
    syncEnabled &&
    settings.gitRemoteUrl &&
    (syncMode === "push_only" || syncMode === "bidirectional");
  const canPull =
    syncEnabled &&
    settings.gitRemoteUrl &&
    (syncMode === "pull_only" || syncMode === "bidirectional");

  return (
    <div className="space-y-6">
      {/* Remote Configuration */}
      <Section title="Git 리모트 설정" description="외부 Git 저장소와의 동기화를 설정합니다.">
        <div className="space-y-4">
          <Field label="리모트 URL">
            <input
              type="text"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              className="w-full px-3 py-2 rounded text-sm"
              style={{
                background: "var(--sidebar-bg)",
                border: "1px solid var(--border)",
              }}
            />
          </Field>

          <Field label="브랜치">
            <input
              type="text"
              value={remoteBranch}
              onChange={(e) => setRemoteBranch(e.target.value)}
              placeholder="main"
              className="w-full px-3 py-2 rounded text-sm"
              style={{
                background: "var(--sidebar-bg)",
                border: "1px solid var(--border)",
              }}
            />
          </Field>

          <Field label={`Personal Access Token (PAT)${settings.gitRemoteToken ? " — 설정됨" : ""}`}>
            <input
              type="password"
              value={remoteToken}
              onChange={(e) => setRemoteToken(e.target.value)}
              placeholder={settings.gitRemoteToken ? "변경하려면 새 토큰을 입력하세요" : "ghp_xxxx..."}
              className="w-full px-3 py-2 rounded text-sm"
              style={{
                background: "var(--sidebar-bg)",
                border: "1px solid var(--border)",
              }}
              disabled={!isOwner}
            />
            {!isOwner && (
              <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                소유자만 토큰을 변경할 수 있습니다.
              </p>
            )}
          </Field>

          {/* Test Connection */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleTestConnection}
              disabled={testing || !remoteUrl.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors"
              style={{
                background: "var(--sidebar-bg)",
                border: "1px solid var(--border)",
                opacity: testing || !remoteUrl.trim() ? 0.5 : 1,
              }}
            >
              {testing ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                <Wifi size={14} />
              )}
              연결 테스트
            </button>

            {testResult && (
              <span
                className="flex items-center gap-1 text-sm"
                style={{ color: testResult.success ? "#22c55e" : "#ef4444" }}
              >
                {testResult.success ? (
                  <>
                    <CheckCircle2 size={14} /> 연결 성공
                  </>
                ) : (
                  <>
                    <AlertTriangle size={14} /> {testResult.error || "연결 실패"}
                  </>
                )}
              </span>
            )}
          </div>
        </div>
      </Section>

      {/* Sync Mode */}
      <Section title="동기화 모드">
        <div className="space-y-4">
          <Field label="모드">
            <select
              value={syncMode}
              onChange={(e) => setSyncMode(e.target.value)}
              className="w-full px-3 py-2 rounded text-sm"
              style={{
                background: "var(--sidebar-bg)",
                border: "1px solid var(--border)",
              }}
            >
              {SYNC_MODE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={syncEnabled}
                onChange={(e) => setSyncEnabled(e.target.checked)}
                className="rounded"
              />
              동기화 활성화
            </label>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={autoSyncOnSave}
                onChange={(e) => setAutoSyncOnSave(e.target.checked)}
                className="rounded"
              />
              페이지 저장 시 자동 Push
            </label>
          </div>
        </div>
      </Section>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 rounded text-sm font-medium"
          style={{
            background: "var(--primary)",
            color: "var(--background)",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
          설정 저장
        </button>
      </div>

      {/* Manual Sync Actions */}
      <Section title="수동 동기화">
        <div className="flex items-center gap-3">
          <button
            onClick={handlePush}
            disabled={pushing || !canPush}
            className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors"
            style={{
              background: "var(--sidebar-bg)",
              border: "1px solid var(--border)",
              opacity: pushing || !canPush ? 0.5 : 1,
            }}
          >
            {pushing ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <ArrowUpCircle size={14} />
            )}
            Push
          </button>

          <button
            onClick={handlePull}
            disabled={pulling || !canPull}
            className="flex items-center gap-2 px-4 py-2 rounded text-sm font-medium transition-colors"
            style={{
              background: "var(--sidebar-bg)",
              border: "1px solid var(--border)",
              opacity: pulling || !canPull ? 0.5 : 1,
            }}
          >
            {pulling ? (
              <Loader2 className="animate-spin" size={14} />
            ) : (
              <ArrowDownCircle size={14} />
            )}
            Pull
          </button>

          <button
            onClick={() => fetchLogs(1)}
            className="flex items-center gap-2 px-4 py-2 rounded text-sm transition-colors"
            style={{
              background: "var(--sidebar-bg)",
              border: "1px solid var(--border)",
            }}
          >
            <RefreshCw size={14} />
            새로고침
          </button>
        </div>

        {!syncEnabled && (
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            동기화를 활성화한 후 사용할 수 있습니다.
          </p>
        )}
      </Section>

      {/* Sync History */}
      <Section title="동기화 이력">
        {logsLoading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="animate-spin" size={18} style={{ color: "var(--muted)" }} />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: "var(--muted)" }}>
            동기화 이력이 없습니다.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="text-xs"
                    style={{ color: "var(--muted)", borderBottom: "1px solid var(--border)" }}
                  >
                    <th className="text-left py-2 px-2">방향</th>
                    <th className="text-left py-2 px-2">상태</th>
                    <th className="text-left py-2 px-2">트리거</th>
                    <th className="text-left py-2 px-2">변경 파일</th>
                    <th className="text-left py-2 px-2">시작 시각</th>
                    <th className="text-left py-2 px-2">오류</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr
                      key={log.id}
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <td className="py-2 px-2">
                        <span className="flex items-center gap-1">
                          {log.direction === "push" ? (
                            <ArrowUpCircle size={12} />
                          ) : (
                            <ArrowDownCircle size={12} />
                          )}
                          {getDirectionLabel(log.direction)}
                        </span>
                      </td>
                      <td className="py-2 px-2">
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                          style={getStatusBadgeStyle(log.status)}
                        >
                          {log.status === "running" && (
                            <Loader2 className="animate-spin" size={10} />
                          )}
                          {log.status === "success" && <CheckCircle2 size={10} />}
                          {log.status === "error" && <AlertTriangle size={10} />}
                          {log.status === "running"
                            ? "실행 중"
                            : log.status === "success"
                              ? "성공"
                              : "오류"}
                        </span>
                      </td>
                      <td className="py-2 px-2">{getTriggerLabel(log.trigger)}</td>
                      <td className="py-2 px-2">{log.filesChanged}</td>
                      <td className="py-2 px-2" style={{ color: "var(--muted)" }}>
                        {formatDateTime(log.startedAt)}
                      </td>
                      <td
                        className="py-2 px-2 max-w-[200px] truncate"
                        title={log.errorMessage || undefined}
                        style={{ color: log.errorMessage ? "#ef4444" : "var(--muted)" }}
                      >
                        {log.errorMessage || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {logsTotalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <button
                  onClick={() => fetchLogs(logsPage - 1)}
                  disabled={logsPage <= 1}
                  className="px-3 py-1 rounded text-sm"
                  style={{
                    background: "var(--sidebar-bg)",
                    border: "1px solid var(--border)",
                    opacity: logsPage <= 1 ? 0.5 : 1,
                  }}
                >
                  이전
                </button>
                <span className="text-sm" style={{ color: "var(--muted)" }}>
                  {logsPage} / {logsTotalPages}
                </span>
                <button
                  onClick={() => fetchLogs(logsPage + 1)}
                  disabled={logsPage >= logsTotalPages}
                  className="px-3 py-1 rounded text-sm"
                  style={{
                    background: "var(--sidebar-bg)",
                    border: "1px solid var(--border)",
                    opacity: logsPage >= logsTotalPages ? 0.5 : 1,
                  }}
                >
                  다음
                </button>
              </div>
            )}
          </>
        )}
      </Section>
    </div>
  );
}
