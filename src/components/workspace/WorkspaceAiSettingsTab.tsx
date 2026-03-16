"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ChevronDown,
  Database,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Wand2,
} from "lucide-react";
import {
  AI_PROVIDER_VALUES,
  AI_TASK_VALUES,
  DEFAULT_AI_TASK_ROUTING,
  WorkspaceAiProfile,
  WorkspaceAiTaskRouting,
  buildDefaultAiProfile,
  getAiProviderLabel,
  getAiTaskLabel,
} from "@/lib/aiConfig";
import { formatDateTime } from "@/lib/utils/dateFormat";
import { getStatusBadgeStyle } from "@/lib/utils/statusStyles";
import { Section, Field } from "@/components/ui/FormLayout";

interface WorkspaceAiSettingsResponse {
  aiEnabled: boolean;
  aiProfiles: WorkspaceAiProfile[];
  aiTaskRouting: WorkspaceAiTaskRouting;
  allowPublicPages: boolean;
  allowMemberInvite: boolean;
  defaultPageAccess: string;
  maxFileUploadMb: number;
  uploadDlpScanMode: string | null;
  uploadDlpDetectors: string[] | null;
  uploadDlpMaxExtractedCharacters: number | null;
  googleCalendarClientId: string | null;
  googleCalendarClientSecret: string | null;
}

interface SearchIndexJobEntry {
  id: string;
  jobType: string;
  status: string;
  attempts: number;
  lastError: string | null;
  payload: Record<string, unknown> | null;
  summary: Record<string, unknown> | null;
  startedAt: string | null;
  processedAt: string | null;
  createdAt: string;
}

interface SearchIndexWorkerRunEntry {
  id: string;
  searchIndexWorkerRunId: string;
  trigger: string;
  status: string;
  workspaceScopeId: string | null;
  limit: number | null;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  runSummary: Record<string, unknown> | null;
  summary: {
    processedJobCount: number;
    successJobCount: number;
    errorJobCount: number;
    pageReindexJobCount: number;
    workspaceReindexJobCount: number;
  };
}

interface VectorStoreStatusEntry {
  configuredBackend: "json" | "pgvector" | "qdrant";
  effectiveReadBackend: "json" | "pgvector" | "qdrant";
  fallbackActive: boolean;
  helperTable: string | null;
  pgvector: {
    ready: boolean;
    checkedAt: string | null;
    lastError: string | null;
    lastErrorCode: string | null;
    autoInitEnabled: boolean;
  };
  qdrant: {
    ready: boolean;
    checkedAt: string | null;
    lastError: string | null;
    lastErrorCode: string | null;
    autoInitEnabled: boolean;
    collectionPrefix: string;
    collectionCount: number;
    collectionNames: string[];
  };
  counts: {
    jsonChunkCount: number;
    vectorChunkCount: number | null;
  };
  workspaceCounts: {
    workspaceId: string;
    jsonChunkCount: number;
    vectorChunkCount: number | null;
  } | null;
}

type StatusMessage = {
  tone: "success" | "error" | "info";
  text: string;
};

const TEST_PROMPT = "Reply with exactly OK.";

function getSearchIndexJobTypeLabel(jobType: string) {
  if (jobType === "workspace_reindex") {
    return "워크스페이스 재색인";
  }
  if (jobType === "page_reindex") {
    return "페이지 재색인";
  }
  return jobType;
}

function getSearchIndexJobStatusMeta(status: string) {
  return getStatusBadgeStyle(status);
}

function getSearchIndexJobSummary(job: SearchIndexJobEntry) {
  const parts: string[] = [];
  const payload = job.payload || {};
  const summary = job.summary || {};

  if (job.jobType === "page_reindex") {
    if (typeof payload.title === "string" && payload.title.trim()) {
      parts.push(payload.title);
    } else if (typeof payload.slug === "string" && payload.slug.trim()) {
      parts.push(payload.slug);
    }
  }

  if (job.jobType === "workspace_reindex" && typeof payload.limit === "number") {
    parts.push(`limit ${payload.limit}`);
  }

  if (typeof summary.indexedPages === "number") {
    parts.push(`인덱싱 ${summary.indexedPages}개`);
  }
  if (typeof summary.disabledPages === "number" && summary.disabledPages > 0) {
    parts.push(`비활성 ${summary.disabledPages}개`);
  }
  if (typeof summary.errorPages === "number" && summary.errorPages > 0) {
    parts.push(`오류 ${summary.errorPages}개`);
  }
  if (typeof summary.clearedPages === "number" && summary.clearedPages > 0) {
    parts.push(`정리 ${summary.clearedPages}개`);
  }

  return parts.join(" · ");
}

function getSearchIndexWorkerTriggerLabel(trigger: string) {
  if (trigger === "scheduled") {
    return "스케줄";
  }
  if (trigger === "api") {
    return "UI/API";
  }
  return "수동";
}

function getVectorBackendLabel(backend: "json" | "pgvector" | "qdrant") {
  if (backend === "pgvector") return "pgvector";
  if (backend === "qdrant") return "Qdrant";
  return "JSON";
}

function getConfiguredBackendLabel(backend: "json" | "pgvector" | "qdrant") {
  if (backend === "pgvector") return "pgvector";
  if (backend === "qdrant") return "Qdrant";
  return "JSON";
}

function formatCount(value: number | null) {
  if (value === null) return "-";
  return new Intl.NumberFormat("ko-KR").format(value);
}

function getProviderBaseUrlPlaceholder(provider: WorkspaceAiProfile["provider"]) {
  switch (provider) {
    case "anthropic":
      return "https://api.anthropic.com";
    case "openai":
      return "https://api.openai.com";
    case "gemini":
      return "https://generativelanguage.googleapis.com";
    case "openai-compatible":
      return "https://your-gateway.example.com/v1";
    case "ollama":
      return "http://localhost:11434";
    default:
      return "";
  }
}

function generateId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function createProfile(index: number) {
  return buildDefaultAiProfile({
    id: generateId(),
    name: `Profile ${index + 1}`,
    provider: "openai",
    model: "",
    baseUrl: null,
    apiKey: null,
    maxTokens: 2048,
  });
}

export function WorkspaceAiSettingsTab({
  workspaceId,
  isOwner,
  showToast,
}: {
  workspaceId: string;
  isOwner: boolean;
  showToast: (message: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [profiles, setProfiles] = useState<WorkspaceAiProfile[]>([]);
  const [taskRouting, setTaskRouting] = useState<WorkspaceAiTaskRouting>({
    ...DEFAULT_AI_TASK_ROUTING,
  });
  const [allowPublicPages, setAllowPublicPages] = useState(true);
  const [allowMemberInvite, setAllowMemberInvite] = useState(true);
  const [defaultPageAccess, setDefaultPageAccess] = useState("workspace");
  const [maxFileUploadMb, setMaxFileUploadMb] = useState(10);
  const [dlpScanMode, setDlpScanMode] = useState<string | null>(null);
  const [dlpDetectors, setDlpDetectors] = useState<string[]>([]);
  const [dlpMaxChars, setDlpMaxChars] = useState<number | null>(null);
  const [gcalClientId, setGcalClientId] = useState("");
  const [gcalClientSecret, setGcalClientSecret] = useState("");
  const [error, setError] = useState("");
  const [profileStatus, setProfileStatus] = useState<Record<string, StatusMessage>>({});
  const [modelOptions, setModelOptions] = useState<Record<string, string[]>>({});
  const [busyAction, setBusyAction] = useState<Record<string, "models" | "connect" | "generate" | null>>({});
  const [reindexing, setReindexing] = useState(false);
  const [reindexStatus, setReindexStatus] = useState<StatusMessage | null>(null);
  const [indexJobs, setIndexJobs] = useState<SearchIndexJobEntry[]>([]);
  const [indexJobsLoading, setIndexJobsLoading] = useState(false);
  const [processingJobs, setProcessingJobs] = useState(false);
  const [workerRuns, setWorkerRuns] = useState<SearchIndexWorkerRunEntry[]>([]);
  const [workerRunsLoading, setWorkerRunsLoading] = useState(false);
  const [vectorStoreStatus, setVectorStoreStatus] =
    useState<VectorStoreStatusEntry | null>(null);
  const [vectorStoreLoading, setVectorStoreLoading] = useState(false);
  const [vectorStoreError, setVectorStoreError] = useState("");

  const enabledProfiles = useMemo(
    () => profiles.filter((profile) => profile.enabled),
    [profiles]
  );

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/settings`);
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error || "AI 설정을 불러오지 못했습니다.");
        return;
      }

      const data = (await res.json()) as WorkspaceAiSettingsResponse;
      setAiEnabled(data.aiEnabled);
      setProfiles(
        Array.isArray(data.aiProfiles) && data.aiProfiles.length > 0
          ? data.aiProfiles
          : [createProfile(0)]
      );
      setTaskRouting({
        ...DEFAULT_AI_TASK_ROUTING,
        ...(data.aiTaskRouting || {}),
      });
      setAllowPublicPages(data.allowPublicPages);
      setAllowMemberInvite(data.allowMemberInvite);
      setDefaultPageAccess(data.defaultPageAccess || "workspace");
      setMaxFileUploadMb(data.maxFileUploadMb || 10);
      setDlpScanMode(data.uploadDlpScanMode || null);
      setDlpDetectors(data.uploadDlpDetectors || []);
      setDlpMaxChars(data.uploadDlpMaxExtractedCharacters || null);
      setGcalClientId(data.googleCalendarClientId || "");
      setGcalClientSecret(data.googleCalendarClientSecret || "");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void fetchSettings();
  }, [fetchSettings]);

  const fetchIndexJobs = useCallback(async () => {
    setIndexJobsLoading(true);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/ai/index-jobs?limit=8`);
      const data = (await res.json().catch(() => null)) as
        | { data?: SearchIndexJobEntry[] }
        | null;
      if (!res.ok) {
        throw new Error("인덱싱 작업을 불러오지 못했습니다.");
      }
      setIndexJobs(Array.isArray(data?.data) ? data.data : []);
    } catch (_error) {
      setIndexJobs([]);
    } finally {
      setIndexJobsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!aiEnabled) return;
    void fetchIndexJobs();
  }, [aiEnabled, fetchIndexJobs]);

  const fetchWorkerRuns = useCallback(async () => {
    setWorkerRunsLoading(true);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/ai/index-worker-runs?limit=5`);
      const data = (await res.json().catch(() => null)) as
        | { data?: SearchIndexWorkerRunEntry[] }
        | null;
      if (!res.ok) {
        throw new Error("워커 실행 이력을 불러오지 못했습니다.");
      }
      setWorkerRuns(Array.isArray(data?.data) ? data.data : []);
    } catch (_error) {
      setWorkerRuns([]);
    } finally {
      setWorkerRunsLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!aiEnabled) return;
    void fetchWorkerRuns();
  }, [aiEnabled, fetchWorkerRuns]);

  const fetchVectorStoreStatus = useCallback(
    async (forceCheck = false) => {
      setVectorStoreLoading(true);
      setVectorStoreError("");

      try {
        const params = new URLSearchParams();
        if (forceCheck) {
          params.set("refresh", "1");
        }

        const res = await fetch(
          `/api/workspaces/${workspaceId}/ai/vector-store-status${
            params.toString() ? `?${params.toString()}` : ""
          }`
        );
        const data = (await res.json().catch(() => null)) as
          | { error?: string; status?: VectorStoreStatusEntry }
          | null;
        if (!res.ok || !data?.status) {
          throw new Error(data?.error || "벡터 스토어 상태를 불러오지 못했습니다.");
        }
        setVectorStoreStatus(data.status);
      } catch (fetchError) {
        setVectorStoreStatus(null);
        setVectorStoreError(
          fetchError instanceof Error
            ? fetchError.message
            : "벡터 스토어 상태를 불러오지 못했습니다."
        );
      } finally {
        setVectorStoreLoading(false);
      }
    },
    [workspaceId]
  );

  useEffect(() => {
    if (!aiEnabled) return;
    void fetchVectorStoreStatus();
  }, [aiEnabled, fetchVectorStoreStatus]);

  function updateProfile(profileId: string, patch: Partial<WorkspaceAiProfile>) {
    setProfiles((current) =>
      current.map((profile) =>
        profile.id === profileId ? { ...profile, ...patch } : profile
      )
    );
  }

  function removeProfile(profileId: string) {
    setProfiles((current) => current.filter((profile) => profile.id !== profileId));
    setTaskRouting((current) => {
      const next = { ...current };
      for (const task of AI_TASK_VALUES) {
        if (next[task] === profileId) {
          next[task] = null;
        }
      }
      return next;
    });
    setProfileStatus((current) => {
      const next = { ...current };
      delete next[profileId];
      return next;
    });
    setModelOptions((current) => {
      const next = { ...current };
      delete next[profileId];
      return next;
    });
  }

  function addProfile() {
    setProfiles((current) => [...current, createProfile(current.length)]);
  }

  async function callProfileAction(
    profile: WorkspaceAiProfile,
    action: "models" | "connect" | "generate"
  ) {
    setBusyAction((current) => ({ ...current, [profile.id]: action }));
    setProfileStatus((current) => ({
      ...current,
      [profile.id]: { tone: "info", text: "처리 중..." },
    }));

    try {
      const endpoint =
        action === "models"
          ? "models"
          : action === "connect"
            ? "test-connection"
            : "test-generation";
      const res = await fetch(`/api/workspaces/${workspaceId}/ai/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          prompt: action === "generate" ? TEST_PROMPT : undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { error?: string; models?: string[]; message?: string; output?: string }
        | null;
      if (!res.ok) {
        throw new Error(data?.error || "요청에 실패했습니다.");
      }

      if (action === "models") {
        setModelOptions((current) => ({
          ...current,
          [profile.id]: data?.models || [],
        }));
        setProfileStatus((current) => ({
          ...current,
          [profile.id]: {
            tone: "success",
            text:
              data?.models && data.models.length > 0
                ? `${data.models.length}개 모델을 가져왔습니다.`
                : "모델 목록을 가져왔지만 비어 있습니다.",
          },
        }));
        return;
      }

      if (action === "connect") {
        setProfileStatus((current) => ({
          ...current,
          [profile.id]: {
            tone: "success",
            text: data?.message || "연결 테스트가 성공했습니다.",
          },
        }));
        return;
      }

      setProfileStatus((current) => ({
        ...current,
        [profile.id]: {
          tone: "success",
          text: `LLM 응답: ${data?.output || "(empty)"}`,
        },
      }));
    } catch (actionError) {
      setProfileStatus((current) => ({
        ...current,
        [profile.id]: {
          tone: "error",
          text:
            actionError instanceof Error
              ? actionError.message
              : "처리에 실패했습니다.",
        },
      }));
    } finally {
      setBusyAction((current) => ({ ...current, [profile.id]: null }));
    }
  }

  async function saveSettings() {
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiEnabled,
          aiProfiles: profiles,
          aiTaskRouting: taskRouting,
          allowPublicPages,
          allowMemberInvite,
          defaultPageAccess,
          maxFileUploadMb,
          uploadDlpScanMode: dlpScanMode,
          uploadDlpDetectors: dlpDetectors.length > 0 ? dlpDetectors : null,
          uploadDlpMaxExtractedCharacters: dlpMaxChars,
          googleCalendarClientId: gcalClientId || null,
          googleCalendarClientSecret: gcalClientSecret || null,
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(data?.error || "설정을 저장하지 못했습니다.");
      }

      await fetchSettings();
      showToast("AI 설정이 저장되었습니다");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "설정을 저장하지 못했습니다."
      );
    } finally {
      setSaving(false);
    }
  }

  async function triggerWorkspaceReindex(dryRun = false) {
    setReindexing(true);
    setReindexStatus({
      tone: "info",
      text: dryRun ? "Dry run 실행 중..." : "재색인 작업을 큐에 등록하는 중...",
    });

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/ai/reindex`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            error?: string;
            queued?: boolean;
            job?: { id: string; status: string };
            summary?: {
              totalPages: number;
              indexedPages: number;
              emptyPages: number;
              disabledPages: number;
              clearedPages: number;
              errorPages: number;
            };
          }
        | null;
      if (!res.ok) {
        throw new Error(data?.error || "재색인에 실패했습니다.");
      }

      if (dryRun) {
        if (!data?.summary) {
          throw new Error("재색인 결과를 불러오지 못했습니다.");
        }
        const summary = data.summary;
        setReindexStatus({
          tone: "success",
          text: `Dry run 완료: 총 ${summary.totalPages}개 페이지, 인덱싱 가능 ${summary.indexedPages}개`,
        });
        showToast("임베딩 dry run이 완료되었습니다");
        return;
      }

      if (!data?.queued) {
        throw new Error("재색인 작업을 큐에 등록하지 못했습니다.");
      }

      setReindexStatus({
        tone: "info",
        text:
          "재색인 작업을 큐에 등록했습니다. 워커가 없으면 아래 큐 처리 버튼이나 `bun run semantic:index-jobs`로 소비하세요.",
      });
      showToast("임베딩 재색인 작업을 큐에 등록했습니다");
      await fetchIndexJobs();
      await fetchWorkerRuns();
    } catch (reindexError) {
      setReindexStatus({
        tone: "error",
        text:
          reindexError instanceof Error
            ? reindexError.message
            : "재색인에 실패했습니다.",
      });
    } finally {
      setReindexing(false);
    }
  }

  async function processWorkspaceIndexJobs() {
    setProcessingJobs(true);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/ai/process-index-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 20 }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            error?: string;
            runId?: string;
            processedCount?: number;
            successCount?: number;
            errorCount?: number;
          }
        | null;
      if (!res.ok) {
        throw new Error(data?.error || "인덱싱 작업 처리에 실패했습니다.");
      }

      showToast(`인덱싱 작업 ${data?.processedCount || 0}건을 처리했습니다`);
      await fetchIndexJobs();
      await fetchWorkerRuns();
      await fetchVectorStoreStatus();
    } catch (processError) {
      setReindexStatus({
        tone: "error",
        text:
          processError instanceof Error
            ? processError.message
            : "인덱싱 작업 처리에 실패했습니다.",
      });
    } finally {
      setProcessingJobs(false);
    }
  }

  if (loading) {
    return (
      <div className="py-10 text-sm" style={{ color: "var(--muted)" }}>
        AI 설정을 불러오는 중입니다...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div
          className="rounded-lg px-4 py-3 text-sm"
          style={{ background: "rgba(239,68,68,0.08)", color: "rgba(185,28,28,0.9)" }}
        >
          {error}
        </div>
      )}

      <Section
        title="AI 활성화"
        description="워크스페이스 전체 AI 기능 on/off와 기본 정책을 설정합니다."
      >
        <div className="space-y-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={aiEnabled}
              onChange={(e) => setAiEnabled(e.target.checked)}
            />
            AI 기능 활성화
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={allowPublicPages}
                onChange={(e) => setAllowPublicPages(e.target.checked)}
              />
              공개 페이지 허용
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={allowMemberInvite}
                onChange={(e) => setAllowMemberInvite(e.target.checked)}
              />
              메인테이너의 멤버 초대 허용
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="새 페이지 기본 접근 모드">
              <select
                value={defaultPageAccess}
                onChange={(e) => setDefaultPageAccess(e.target.value)}
                className="w-full rounded px-3 py-2 text-sm"
                style={{
                  background: "var(--sidebar-bg)",
                  border: "1px solid var(--border)",
                }}
              >
                <option value="workspace">워크스페이스 전체</option>
                <option value="restricted">제한된 멤버만</option>
              </select>
            </Field>
            <Field label="최대 파일 크기 (MB)">
              <input
                type="number"
                value={maxFileUploadMb}
                onChange={(e) => setMaxFileUploadMb(parseInt(e.target.value, 10) || 10)}
                min={1}
                max={100}
                className="w-full rounded px-3 py-2 text-sm"
                style={{
                  background: "var(--sidebar-bg)",
                  border: "1px solid var(--border)",
                }}
              />
            </Field>
          </div>
        </div>
      </Section>

      <Section
        title="업로드 DLP 정책"
        description="파일 업로드 시 민감 정보(신용카드, 주민등록번호 등)를 탐지합니다. null이면 전역 env 설정을 따릅니다."
      >
        <div className="space-y-4">
          <Field label="DLP 스캔 모드">
            <select
              value={dlpScanMode || ""}
              onChange={(e) => setDlpScanMode(e.target.value || null)}
              className="w-full rounded px-3 py-2 text-sm"
              style={{
                background: "var(--sidebar-bg)",
                border: "1px solid var(--border)",
              }}
            >
              <option value="">전역 설정 사용</option>
              <option value="off">꺼짐</option>
              <option value="best_effort">최선 노력 (경고만)</option>
              <option value="required">필수 (차단)</option>
            </select>
          </Field>

          <div>
            <p className="text-sm font-medium mb-2" style={{ color: "var(--muted)" }}>
              탐지기 (비워두면 전역 설정 사용)
            </p>
            <div className="grid gap-2 md:grid-cols-3">
              {[
                { id: "credit_card", label: "신용카드 번호" },
                { id: "us_ssn", label: "미국 SSN" },
                { id: "korean_rrn", label: "주민등록번호" },
                { id: "aws_access_key", label: "AWS 액세스 키" },
                { id: "private_key", label: "개인 키" },
              ].map((detector) => (
                <label
                  key={detector.id}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={dlpDetectors.includes(detector.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setDlpDetectors((prev) => [...prev, detector.id]);
                      } else {
                        setDlpDetectors((prev) =>
                          prev.filter((d) => d !== detector.id)
                        );
                      }
                    }}
                  />
                  {detector.label}
                </label>
              ))}
            </div>
          </div>

          <Field label="최대 텍스트 추출 글자 수">
            <input
              type="number"
              value={dlpMaxChars ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                setDlpMaxChars(v === "" ? null : parseInt(v, 10) || null);
              }}
              min={1000}
              max={500000}
              placeholder="전역 설정 사용 (기본 50,000)"
              className="w-full rounded px-3 py-2 text-sm"
              style={{
                background: "var(--sidebar-bg)",
                border: "1px solid var(--border)",
              }}
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Google Calendar 연동"
        description="Google Cloud Console에서 OAuth 2.0 클라이언트를 생성하고, 리다이렉트 URI에 /api/google-calendar/callback 을 추가하세요."
      >
        <div className="space-y-4">
          <Field label="Client ID">
            <input
              value={gcalClientId}
              onChange={(e) => setGcalClientId(e.target.value)}
              placeholder="xxxx.apps.googleusercontent.com"
              className="w-full rounded px-3 py-2 text-sm"
              style={{
                background: "var(--sidebar-bg)",
                border: "1px solid var(--border)",
              }}
            />
          </Field>
          <Field label="Client Secret (Owner만 수정 가능)">
            <input
              type="password"
              value={gcalClientSecret}
              onChange={(e) => setGcalClientSecret(e.target.value)}
              placeholder={gcalClientSecret ? "••••••••" : "입력하세요"}
              disabled={!isOwner}
              className="w-full rounded px-3 py-2 text-sm disabled:opacity-50"
              style={{
                background: "var(--sidebar-bg)",
                border: "1px solid var(--border)",
              }}
            />
          </Field>
          {gcalClientId && gcalClientSecret && (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              설정 저장 후, 캘린더 페이지에서 &quot;Google Calendar 연결&quot; 버튼을 클릭하여 연동하세요.
            </p>
          )}
        </div>
      </Section>

      {aiEnabled && (
        <>
          <Section
            title="작업별 모델 라우팅"
            description="여러 프로필을 활성화해 두고 기능별로 다른 모델을 연결할 수 있습니다."
          >
            <div className="grid gap-4 md:grid-cols-2">
              {AI_TASK_VALUES.map((task) => (
                <Field key={task} label={getAiTaskLabel(task)}>
                  <select
                    value={taskRouting[task] || ""}
                    onChange={(e) =>
                      setTaskRouting((current) => ({
                        ...current,
                        [task]: e.target.value || null,
                      }))
                    }
                    className="w-full rounded px-3 py-2 text-sm"
                    style={{
                      background: "var(--sidebar-bg)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <option value="">자동 선택</option>
                    {enabledProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.name} · {profile.model || "모델 미지정"}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
          </Section>

          <Section
            title="AI 프로필"
            description="OpenAI, Gemini, OpenAI-compatible, Ollama, Anthropic 프로필을 여러 개 등록할 수 있습니다."
          >
            <div className="space-y-4">
              {profiles.map((profile, index) => {
                const status = profileStatus[profile.id];
                const busy = busyAction[profile.id];

                return (
                  <div
                    key={profile.id}
                    className="rounded-xl p-4"
                    style={{
                      background: "var(--sidebar-bg)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_200px_auto]">
                          <Field label="프로필 이름">
                            <input
                              value={profile.name}
                              onChange={(e) =>
                                updateProfile(profile.id, { name: e.target.value })
                              }
                              className="w-full rounded px-3 py-2 text-sm"
                              style={{
                                background: "var(--background)",
                                border: "1px solid var(--border)",
                              }}
                            />
                          </Field>
                          <Field label="Provider">
                            <select
                              value={profile.provider}
                              onChange={(e) =>
                                updateProfile(profile.id, {
                                  provider: e.target.value as WorkspaceAiProfile["provider"],
                                })
                              }
                              className="w-full rounded px-3 py-2 text-sm"
                              style={{
                                background: "var(--background)",
                                border: "1px solid var(--border)",
                              }}
                            >
                              {AI_PROVIDER_VALUES.map((provider) => (
                                <option key={provider} value={provider}>
                                  {getAiProviderLabel(provider)}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <label className="mt-6 flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={profile.enabled}
                              onChange={(e) =>
                                updateProfile(profile.id, { enabled: e.target.checked })
                              }
                            />
                            활성화
                          </label>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeProfile(profile.id)}
                        disabled={profiles.length <= 1}
                        className="rounded p-2 text-red-600"
                        style={{ opacity: profiles.length <= 1 ? 0.4 : 1 }}
                        title="프로필 삭제"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Field label="모델">
                        <div className="space-y-2">
                          <input
                            list={`ai-models-${profile.id}`}
                            value={profile.model}
                            onChange={(e) =>
                              updateProfile(profile.id, { model: e.target.value })
                            }
                            placeholder="모델명을 입력하거나 가져온 목록에서 선택"
                            className="w-full rounded px-3 py-2 text-sm"
                            style={{
                              background: "var(--background)",
                              border: "1px solid var(--border)",
                            }}
                          />
                          <datalist id={`ai-models-${profile.id}`}>
                            {(modelOptions[profile.id] || []).map((model) => (
                              <option key={model} value={model} />
                            ))}
                          </datalist>
                        </div>
                      </Field>

                      <Field label="Base URL (선택)">
                        <input
                          value={profile.baseUrl || ""}
                          onChange={(e) =>
                            updateProfile(profile.id, { baseUrl: e.target.value || null })
                          }
                          placeholder={getProviderBaseUrlPlaceholder(profile.provider)}
                          className="w-full rounded px-3 py-2 text-sm"
                          style={{
                            background: "var(--background)",
                            border: "1px solid var(--border)",
                          }}
                        />
                      </Field>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                      <Field label="API Key">
                        <input
                          type="password"
                          value={profile.apiKey || ""}
                          onChange={(e) =>
                            updateProfile(profile.id, {
                              apiKey: e.target.value || null,
                            })
                          }
                          disabled={!isOwner}
                          placeholder={isOwner ? "비워두면 환경변수 사용" : "소유자만 변경 가능"}
                          className="w-full rounded px-3 py-2 text-sm"
                          style={{
                            background: "var(--background)",
                            border: "1px solid var(--border)",
                            opacity: isOwner ? 1 : 0.7,
                          }}
                        />
                      </Field>

                      <div className="flex flex-wrap items-end gap-2">
                        <button
                          type="button"
                          onClick={() => void callProfileAction(profile, "models")}
                          className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm"
                          style={{
                            background: "var(--background)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          {busy === "models" ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <RefreshCw size={14} />
                          )}
                          모델 가져오기
                        </button>
                        <button
                          type="button"
                          onClick={() => void callProfileAction(profile, "connect")}
                          className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm"
                          style={{
                            background: "var(--background)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          {busy === "connect" ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <CheckCircle2 size={14} />
                          )}
                          연결 테스트
                        </button>
                        <button
                          type="button"
                          onClick={() => void callProfileAction(profile, "generate")}
                          className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm text-white"
                          style={{ background: "var(--primary)" }}
                        >
                          {busy === "generate" ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Wand2 size={14} />
                          )}
                          LLM 연동 테스트
                        </button>
                      </div>
                    </div>

                    {status && (
                      <div
                        className="mt-3 rounded px-3 py-2 text-xs"
                        style={{
                          background:
                            status.tone === "success"
                              ? "rgba(34,197,94,0.08)"
                              : status.tone === "error"
                                ? "rgba(239,68,68,0.08)"
                                : "rgba(59,130,246,0.08)",
                          color:
                            status.tone === "success"
                              ? "rgba(4,120,87,0.9)"
                              : status.tone === "error"
                                ? "rgba(185,28,28,0.9)"
                                : "rgba(29,78,216,0.9)",
                        }}
                      >
                        {status.text}
                      </div>
                    )}

                    <details className="mt-4">
                      <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                        <ChevronDown size={14} />
                        고급 설정
                      </summary>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <Field label="Temperature">
                          <input
                            type="number"
                            step="0.1"
                            value={profile.temperature ?? ""}
                            onChange={(e) =>
                              updateProfile(profile.id, {
                                temperature:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              })
                            }
                            className="w-full rounded px-3 py-2 text-sm"
                            style={{
                              background: "var(--background)",
                              border: "1px solid var(--border)",
                            }}
                          />
                        </Field>
                        <Field label="Top P">
                          <input
                            type="number"
                            step="0.05"
                            value={profile.topP ?? ""}
                            onChange={(e) =>
                              updateProfile(profile.id, {
                                topP:
                                  e.target.value === "" ? null : Number(e.target.value),
                              })
                            }
                            className="w-full rounded px-3 py-2 text-sm"
                            style={{
                              background: "var(--background)",
                              border: "1px solid var(--border)",
                            }}
                          />
                        </Field>
                        <Field label="Top K">
                          <input
                            type="number"
                            value={profile.topK ?? ""}
                            onChange={(e) =>
                              updateProfile(profile.id, {
                                topK:
                                  e.target.value === ""
                                    ? null
                                    : parseInt(e.target.value, 10),
                              })
                            }
                            className="w-full rounded px-3 py-2 text-sm"
                            style={{
                              background: "var(--background)",
                              border: "1px solid var(--border)",
                            }}
                          />
                        </Field>
                        <Field label="Max Length / Tokens">
                          <input
                            type="number"
                            value={profile.maxTokens ?? ""}
                            onChange={(e) =>
                              updateProfile(profile.id, {
                                maxTokens:
                                  e.target.value === ""
                                    ? null
                                    : parseInt(e.target.value, 10),
                              })
                            }
                            className="w-full rounded px-3 py-2 text-sm"
                            style={{
                              background: "var(--background)",
                              border: "1px solid var(--border)",
                            }}
                          />
                        </Field>
                        <Field label="Presence Penalty">
                          <input
                            type="number"
                            step="0.1"
                            value={profile.presencePenalty ?? ""}
                            onChange={(e) =>
                              updateProfile(profile.id, {
                                presencePenalty:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              })
                            }
                            className="w-full rounded px-3 py-2 text-sm"
                            style={{
                              background: "var(--background)",
                              border: "1px solid var(--border)",
                            }}
                          />
                        </Field>
                        <Field label="Frequency Penalty">
                          <input
                            type="number"
                            step="0.1"
                            value={profile.frequencyPenalty ?? ""}
                            onChange={(e) =>
                              updateProfile(profile.id, {
                                frequencyPenalty:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              })
                            }
                            className="w-full rounded px-3 py-2 text-sm"
                            style={{
                              background: "var(--background)",
                              border: "1px solid var(--border)",
                            }}
                          />
                        </Field>
                        <Field label="Repeat Penalty">
                          <input
                            type="number"
                            step="0.1"
                            value={profile.repeatPenalty ?? ""}
                            onChange={(e) =>
                              updateProfile(profile.id, {
                                repeatPenalty:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              })
                            }
                            className="w-full rounded px-3 py-2 text-sm"
                            style={{
                              background: "var(--background)",
                              border: "1px solid var(--border)",
                            }}
                          />
                        </Field>
                        <Field label="Seed">
                          <input
                            type="number"
                            value={profile.seed ?? ""}
                            onChange={(e) =>
                              updateProfile(profile.id, {
                                seed:
                                  e.target.value === ""
                                    ? null
                                    : parseInt(e.target.value, 10),
                              })
                            }
                            className="w-full rounded px-3 py-2 text-sm"
                            style={{
                              background: "var(--background)",
                              border: "1px solid var(--border)",
                            }}
                          />
                        </Field>
                        <Field label="Stop Sequences (쉼표 구분)">
                          <input
                            value={profile.stop.join(", ")}
                            onChange={(e) =>
                              updateProfile(profile.id, {
                                stop: e.target.value
                                  .split(",")
                                  .map((item) => item.trim())
                                  .filter(Boolean),
                              })
                            }
                            className="w-full rounded px-3 py-2 text-sm"
                            style={{
                              background: "var(--background)",
                              border: "1px solid var(--border)",
                            }}
                          />
                        </Field>
                      </div>
                    </details>

                    <div
                      className="mt-4 flex items-center gap-2 text-xs"
                      style={{ color: "var(--muted)" }}
                    >
                      <Bot size={12} />
                      프로필 #{index + 1} · {getAiProviderLabel(profile.provider)}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={addProfile}
              className="mt-4 inline-flex items-center gap-2 rounded px-4 py-2 text-sm"
              style={{
                background: "var(--background)",
                border: "1px solid var(--border)",
              }}
            >
              <Plus size={14} />
              프로필 추가
            </button>
          </Section>

          <Section
            title="Semantic Search 운영"
            description="현재 워크스페이스 문서를 다시 임베딩해서 검색 인덱스를 갱신합니다."
          >
            <div
              className="rounded-lg p-4"
              style={{
                background: "var(--sidebar-bg)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Database size={14} />
                    벡터 스토어 상태
                  </div>
                  <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                    현재 검색이 실제로 읽는 backend와 pgvector fallback 여부를 확인합니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchVectorStoreStatus(true)}
                  disabled={vectorStoreLoading}
                  className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm"
                  style={{
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    opacity: vectorStoreLoading ? 0.7 : 1,
                  }}
                >
                  {vectorStoreLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  상태 재검사
                </button>
              </div>

              {vectorStoreError ? (
                <div
                  className="mt-3 rounded px-3 py-2 text-xs"
                  style={{ background: "rgba(239,68,68,0.08)", color: "rgba(185,28,28,0.9)" }}
                >
                  {vectorStoreError}
                </div>
              ) : vectorStoreStatus ? (
                <>
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div
                      className="rounded-lg px-3 py-3"
                      style={{
                        background: "var(--background)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        설정 backend
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {getConfiguredBackendLabel(vectorStoreStatus.configuredBackend)}
                      </div>
                    </div>
                    <div
                      className="rounded-lg px-3 py-3"
                      style={{
                        background: "var(--background)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        실제 읽기 backend
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {getVectorBackendLabel(vectorStoreStatus.effectiveReadBackend)}
                      </div>
                    </div>
                    <div
                      className="rounded-lg px-3 py-3"
                      style={{
                        background: "var(--background)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        이 워크스페이스 JSON chunk
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {formatCount(vectorStoreStatus.workspaceCounts?.jsonChunkCount ?? null)}
                      </div>
                    </div>
                    <div
                      className="rounded-lg px-3 py-3"
                      style={{
                        background: "var(--background)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        이 워크스페이스 vector chunk
                      </div>
                      <div className="mt-1 text-sm font-medium">
                        {formatCount(vectorStoreStatus.workspaceCounts?.vectorChunkCount ?? null)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 text-xs md:grid-cols-2" style={{ color: "var(--muted)" }}>
                    <div>서비스 전체 JSON chunk {formatCount(vectorStoreStatus.counts.jsonChunkCount)}</div>
                    <div>
                      서비스 전체 vector chunk {formatCount(vectorStoreStatus.counts.vectorChunkCount)}
                    </div>
                    <div>
                      Auto init{" "}
                      {vectorStoreStatus.configuredBackend === "pgvector"
                        ? vectorStoreStatus.pgvector.autoInitEnabled
                          ? "ON"
                          : "OFF"
                        : vectorStoreStatus.configuredBackend === "qdrant"
                          ? vectorStoreStatus.qdrant.autoInitEnabled
                            ? "ON"
                            : "OFF"
                          : "-"}
                    </div>
                    <div>
                      {vectorStoreStatus.configuredBackend === "pgvector"
                        ? `Helper table ${vectorStoreStatus.helperTable || "-"}`
                        : vectorStoreStatus.configuredBackend === "qdrant"
                          ? `Collection prefix ${vectorStoreStatus.qdrant.collectionPrefix}`
                          : "외부 인덱스 사용 안 함"}
                    </div>
                    <div>
                      최근 점검{" "}
                      {formatDateTime(
                        vectorStoreStatus.configuredBackend === "pgvector"
                          ? vectorStoreStatus.pgvector.checkedAt
                          : vectorStoreStatus.configuredBackend === "qdrant"
                            ? vectorStoreStatus.qdrant.checkedAt
                            : null
                      )}
                    </div>
                    <div>
                      {getConfiguredBackendLabel(vectorStoreStatus.configuredBackend)} 상태{" "}
                      {vectorStoreStatus.configuredBackend === "pgvector"
                        ? vectorStoreStatus.pgvector.ready
                          ? "정상"
                          : "미사용 / 실패"
                        : vectorStoreStatus.configuredBackend === "qdrant"
                          ? vectorStoreStatus.qdrant.ready
                            ? "정상"
                            : "미사용 / 실패"
                          : "JSON only"}
                      {(vectorStoreStatus.configuredBackend === "pgvector"
                        ? vectorStoreStatus.pgvector.lastErrorCode
                        : vectorStoreStatus.qdrant.lastErrorCode)
                        ? ` (${
                            vectorStoreStatus.configuredBackend === "pgvector"
                              ? vectorStoreStatus.pgvector.lastErrorCode
                              : vectorStoreStatus.qdrant.lastErrorCode
                          })`
                        : ""}
                    </div>
                    {vectorStoreStatus.configuredBackend === "qdrant" && (
                      <div>
                        Qdrant collections {formatCount(vectorStoreStatus.qdrant.collectionCount)}
                      </div>
                    )}
                  </div>

                  {vectorStoreStatus.fallbackActive && (
                    <div
                      className="mt-3 rounded px-3 py-2 text-xs"
                      style={{ background: "rgba(251,146,60,0.08)", color: "rgba(154,52,18,0.9)" }}
                    >
                      <div className="flex items-center gap-2 font-medium">
                        <AlertTriangle size={14} />
                        {getConfiguredBackendLabel(vectorStoreStatus.configuredBackend)}를 설정했지만
                        현재는 JSON fallback으로 읽고 있습니다.
                      </div>
                      {(vectorStoreStatus.configuredBackend === "pgvector"
                        ? vectorStoreStatus.pgvector.lastError
                        : vectorStoreStatus.qdrant.lastError) && (
                        <div className="mt-1 break-words">
                          원인:{" "}
                          {vectorStoreStatus.configuredBackend === "pgvector"
                            ? vectorStoreStatus.pgvector.lastError
                            : vectorStoreStatus.qdrant.lastError}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
                  벡터 스토어 상태를 불러오는 중입니다...
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void triggerWorkspaceReindex(false)}
                disabled={reindexing}
                className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm text-white"
                style={{ background: "var(--primary)", opacity: reindexing ? 0.7 : 1 }}
              >
                {reindexing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} />
                )}
                임베딩 재색인
              </button>
              <button
                type="button"
                onClick={() => void triggerWorkspaceReindex(true)}
                disabled={reindexing}
                className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm"
                style={{
                  background: "var(--background)",
                  border: "1px solid var(--border)",
                  opacity: reindexing ? 0.7 : 1,
                }}
              >
                {reindexing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Wand2 size={14} />
                )}
                Dry Run
              </button>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                전체 서비스 재색인은 `bun run semantic:reindex`를 사용하세요.
              </span>
            </div>
            <div
              className="mt-4 rounded-lg p-4"
              style={{
                background: "var(--sidebar-bg)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">인덱싱 작업 큐</div>
                  <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                    페이지 저장과 워크스페이스 재색인 요청은 큐에 적재됩니다. 운영 배치나 수동
                    처리로 소비할 수 있습니다.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void fetchIndexJobs()}
                    disabled={indexJobsLoading}
                    className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm"
                    style={{
                      background: "var(--background)",
                      border: "1px solid var(--border)",
                      opacity: indexJobsLoading ? 0.7 : 1,
                    }}
                  >
                    {indexJobsLoading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <RefreshCw size={14} />
                    )}
                    새로고침
                  </button>
                  <button
                    type="button"
                    onClick={() => void processWorkspaceIndexJobs()}
                    disabled={processingJobs}
                    className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm"
                    style={{
                      background: "var(--background)",
                      border: "1px solid var(--border)",
                      opacity: processingJobs ? 0.7 : 1,
                    }}
                  >
                    {processingJobs ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Wand2 size={14} />
                    )}
                    큐 처리
                  </button>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {indexJobsLoading ? (
                  <div className="text-sm" style={{ color: "var(--muted)" }}>
                    작업 큐를 불러오는 중입니다...
                  </div>
                ) : indexJobs.length === 0 ? (
                  <div className="text-sm" style={{ color: "var(--muted)" }}>
                    최근 인덱싱 작업이 없습니다.
                  </div>
                ) : (
                  indexJobs.map((job) => {
                    const statusMeta = getSearchIndexJobStatusMeta(job.status);
                    const summaryText = getSearchIndexJobSummary(job);

                    return (
                      <div
                        key={job.id}
                        className="rounded-lg px-3 py-3"
                        style={{
                          background: "var(--background)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">
                            {getSearchIndexJobTypeLabel(job.jobType)}
                          </span>
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{
                              background: statusMeta.background,
                              color: statusMeta.color,
                            }}
                          >
                            {statusMeta.label}
                          </span>
                          <span className="text-xs" style={{ color: "var(--muted)" }}>
                            시도 {job.attempts}회
                          </span>
                        </div>

                        <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                          생성 {formatDateTime(job.createdAt)}
                          {job.startedAt ? ` · 시작 ${formatDateTime(job.startedAt)}` : ""}
                          {job.processedAt ? ` · 완료 ${formatDateTime(job.processedAt)}` : ""}
                        </div>

                        {summaryText && (
                          <div className="mt-2 text-sm" style={{ color: "var(--foreground)" }}>
                            {summaryText}
                          </div>
                        )}

                        {job.lastError && (
                          <div
                            className="mt-2 rounded px-2 py-2 text-xs"
                            style={{ background: "rgba(239,68,68,0.08)", color: "rgba(185,28,28,0.9)" }}
                          >
                            {job.lastError}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            <div
              className="mt-4 rounded-lg p-4"
              style={{
                background: "var(--sidebar-bg)",
                border: "1px solid var(--border)",
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">워커 실행 이력</div>
                  <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                    `semantic:index-jobs` 또는 수동 `큐 처리`로 실행된 최근 워커 결과입니다.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchWorkerRuns()}
                  disabled={workerRunsLoading}
                  className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm"
                  style={{
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    opacity: workerRunsLoading ? 0.7 : 1,
                  }}
                >
                  {workerRunsLoading ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <RefreshCw size={14} />
                  )}
                  새로고침
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {workerRunsLoading ? (
                  <div className="text-sm" style={{ color: "var(--muted)" }}>
                    워커 실행 이력을 불러오는 중입니다...
                  </div>
                ) : workerRuns.length === 0 ? (
                  <div className="text-sm" style={{ color: "var(--muted)" }}>
                    최근 워커 실행 이력이 없습니다.
                  </div>
                ) : (
                  workerRuns.map((run) => {
                    const statusMeta = getSearchIndexJobStatusMeta(run.status);

                    return (
                      <div
                        key={run.id}
                        className="rounded-lg px-3 py-3"
                        style={{
                          background: "var(--background)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-medium">
                            {getSearchIndexWorkerTriggerLabel(run.trigger)}
                          </span>
                          <span
                            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                            style={{
                              background: statusMeta.background,
                              color: statusMeta.color,
                            }}
                          >
                            {statusMeta.label}
                          </span>
                          {run.limit ? (
                            <span className="text-xs" style={{ color: "var(--muted)" }}>
                              limit {run.limit}
                            </span>
                          ) : null}
                        </div>
                        <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                          시작 {formatDateTime(run.startedAt)} · 완료 {formatDateTime(run.finishedAt)}
                        </div>
                        <div className="mt-2 text-sm">
                          작업 {run.summary.processedJobCount}건 · 성공 {run.summary.successJobCount}건
                          · 오류 {run.summary.errorJobCount}건
                        </div>
                        <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                          페이지 재색인 {run.summary.pageReindexJobCount}건 · 워크스페이스 재색인{" "}
                          {run.summary.workspaceReindexJobCount}건
                        </div>
                        {run.errorMessage && (
                          <div
                            className="mt-2 rounded px-2 py-2 text-xs"
                            style={{ background: "rgba(239,68,68,0.08)", color: "rgba(185,28,28,0.9)" }}
                          >
                            {run.errorMessage}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
            {reindexStatus && (
              <div
                className="mt-3 rounded px-3 py-2 text-sm"
                style={{
                  background:
                    reindexStatus.tone === "success"
                      ? "rgba(34,197,94,0.08)"
                      : reindexStatus.tone === "error"
                        ? "rgba(239,68,68,0.08)"
                        : "rgba(59,130,246,0.08)",
                  color:
                    reindexStatus.tone === "success"
                      ? "rgba(22,101,52,0.9)"
                      : reindexStatus.tone === "error"
                        ? "rgba(185,28,28,0.9)"
                        : "rgba(29,78,216,0.9)",
                }}
              >
                {reindexStatus.text}
              </div>
            )}
          </Section>
        </>
      )}

      <div className="pt-4" style={{ borderTop: "1px solid var(--border)" }}>
        <button
          type="button"
          onClick={() => void saveSettings()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded px-4 py-2 text-sm text-white"
          style={{ background: "var(--primary)", opacity: saving ? 0.8 : 1 }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "저장 중..." : "AI 설정 저장"}
        </button>
      </div>
    </div>
  );
}
