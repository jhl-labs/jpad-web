"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowLeft, Database, HardDriveDownload, Layers, RefreshCw, ScrollText, Server, ShieldCheck, Users } from "lucide-react";
import { formatDateTimeFull } from "@/lib/utils/dateFormat";
import { getStatusBadgeStyle } from "@/lib/utils/statusStyles";

interface OverviewSummary {
  latestSuccessfulBackup: {
    id: string;
    mode: string;
    trigger: string;
    status: string;
    destinationPath: string | null;
    startedAt: string;
    finishedAt: string | null;
    summary: {
      artifactCount?: number;
      totalBytes?: string;
      warnings?: string[];
    } | null;
  } | null;
  latestSuccessfulRestoreDrill: {
    id: string;
    backupRunId: string;
    trigger: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    summary: {
      verifiedArtifactCount?: number;
      repoFsckPassedCount?: number;
      warnings?: string[];
    } | null;
  } | null;
  latestSuccessfulIndexWorker: {
    id: string;
    trigger: string;
    status: string;
    workspaceScopeId: string | null;
    limit: number | null;
    startedAt: string;
    finishedAt: string | null;
    summary: {
      processedJobCount?: number;
      successJobCount?: number;
      errorJobCount?: number;
      workspaceCount?: number;
    } | null;
  } | null;
  runningBackupCount: number;
  failedBackupCount: number;
  runningRestoreDrillCount: number;
  failedRestoreDrillCount: number;
  runningIndexWorkerCount: number;
  failedIndexWorkerCount: number;
  attachmentSecurityQueue: {
    quarantinedCount: number;
    releasedCount: number;
    warningCount: number;
    latestReview: {
      id: string;
      filename: string;
      workspaceId: string | null;
      disposition: string | null;
      reviewedAt: string | null;
    } | null;
  };
  auditWebhookStatus: {
    enabled: boolean;
    label: string;
    urlConfigured: boolean;
    maxAttempts: number;
    batchLimit: number;
    timeoutMs: number;
    pendingCount: number;
    errorCount: number;
    deliveredCount: number;
    latestDelivered: {
      id: string;
      deliveredAt: string | null;
      action: string;
      workspaceId: string | null;
    } | null;
  };
  uploadSecurityStatus: {
    malwareScanMode: "off" | "best_effort" | "required";
    clamavConfigured: boolean;
    clamavHost: string | null;
    clamavPort: number;
    clamavTimeoutMs: number;
    dlpScanMode: "off" | "best_effort" | "required";
    dlpDetectors: string[];
    dlpMaxExtractedCharacters: number;
    dlpCanInspectPdf: boolean;
    dlpCanInspectDocx: boolean;
    dlpCanInspectXlsx: boolean;
    dlpCanInspectSvg: boolean;
    allowSvg: boolean;
    enforceFilenamePolicy: boolean;
    blockedIntermediateExtensions: string[];
  };
  vectorStoreStatus: {
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
  };
}

interface BackupArtifact {
  id: string;
  kind: string;
  status: string;
  filePath: string | null;
  sizeBytes: string | null;
  checksumSha256: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface BackupRunEntry {
  id: string;
  mode: "dry_run" | "execute";
  trigger: string;
  status: "running" | "success" | "error";
  backupRootDir: string;
  destinationPath: string | null;
  summary: Record<string, unknown> | null;
  manifest: Record<string, unknown> | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  artifactCount: number;
  restoreDrillCount: number;
  artifacts: BackupArtifact[];
  latestRestoreDrill: {
    id: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
  } | null;
}

interface RestoreDrillEntry {
  id: string;
  backupRunId: string;
  trigger: string;
  status: "running" | "success" | "error";
  summary: Record<string, unknown> | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  backupRun: {
    id: string;
    mode: string;
    trigger: string;
    destinationPath: string | null;
    startedAt: string;
  };
}

interface IndexWorkerWorkspaceEntry {
  id: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  processedJobCount: number;
  successJobCount: number;
  errorJobCount: number;
  pageReindexJobCount: number;
  workspaceReindexJobCount: number;
}

interface IndexWorkerRunEntry {
  id: string;
  trigger: string;
  status: "running" | "success" | "error";
  workspaceScopeId: string | null;
  limit: number | null;
  summary: Record<string, unknown> | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
  workspaceRuns: IndexWorkerWorkspaceEntry[];
}

interface AuditDeliveryEntry {
  id: string;
  destinationType: string;
  destinationLabel: string;
  status: "pending" | "delivered" | "error";
  attempts: number;
  nextAttemptAt: string;
  lastAttemptAt: string | null;
  deliveredAt: string | null;
  responseStatus: number | null;
  lastError: string | null;
  createdAt: string;
  auditLog: {
    action: string;
    workspaceId: string | null;
    pageId: string | null;
    actorEmail: string | null;
    createdAt: string;
  };
}

interface AttachmentSecurityEntry {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  securityStatus: string;
  securityDisposition: string | null;
  securityScanner: string | null;
  securityFindings: Array<{ message?: string; code?: string; severity?: string }> | null;
  securityCheckedAt: string | null;
  securityReviewedAt: string | null;
  securityReviewNote: string | null;
  createdAt: string;
  page: {
    id: string;
    title: string;
    slug: string;
    workspace: {
      id: string;
      name: string;
      slug: string;
    };
  };
  reviewedBy: {
    id: string;
    email: string;
    name: string;
  } | null;
}

const formatDateTime = formatDateTimeFull;

function formatBytes(value: string | undefined) {
  if (!value) return "-";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = parsed;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function getStatusStyle(status: string) {
  const style = getStatusBadgeStyle(status);
  if (status === "success") return { ...style, label: "성공" };
  return style;
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

function getAttachmentSecurityState(entry: AttachmentSecurityEntry) {
  if (entry.securityStatus === "blocked" && entry.securityDisposition === "released") {
    return {
      label: "수동 허용",
      background: "rgba(59,130,246,0.1)",
      color: "rgba(29,78,216,0.9)",
    };
  }

  if (entry.securityStatus === "blocked") {
    return {
      label: "격리",
      background: "rgba(239,68,68,0.1)",
      color: "rgba(153,27,27,0.9)",
    };
  }

  return {
    label: "경고",
    background: "rgba(251,146,60,0.08)",
    color: "rgba(154,52,18,0.9)",
  };
}

export function OpsDashboard() {
  const router = useRouter();
  const [overview, setOverview] = useState<OverviewSummary | null>(null);
  const [backups, setBackups] = useState<BackupRunEntry[]>([]);
  const [restoreDrills, setRestoreDrills] = useState<RestoreDrillEntry[]>([]);
  const [indexWorkers, setIndexWorkers] = useState<IndexWorkerRunEntry[]>([]);
  const [auditDeliveries, setAuditDeliveries] = useState<AuditDeliveryEntry[]>([]);
  const [attachmentSecurityItems, setAttachmentSecurityItems] = useState<
    AttachmentSecurityEntry[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [backupStatus, setBackupStatus] = useState("all");
  const [backupMode, setBackupMode] = useState("all");
  const [restoreStatus, setRestoreStatus] = useState("all");
  const [indexWorkerStatus, setIndexWorkerStatus] = useState("all");
  const [auditDeliveryStatus, setAuditDeliveryStatus] = useState("all");
  const [attachmentSecurityStatus, setAttachmentSecurityStatus] = useState("quarantined");
  const [vectorStoreRefreshing, setVectorStoreRefreshing] = useState(false);
  const [attachmentActionId, setAttachmentActionId] = useState<string | null>(null);

  const fetchData = useCallback(
    async (
        filters?: {
          backupStatus?: string;
          backupMode?: string;
          restoreStatus?: string;
          indexWorkerStatus?: string;
          auditDeliveryStatus?: string;
          attachmentSecurityStatus?: string;
        }
      ) => {
      setLoading(true);
      setError("");

      try {
        const nextBackupStatus = filters?.backupStatus ?? backupStatus;
        const nextBackupMode = filters?.backupMode ?? backupMode;
        const nextRestoreStatus = filters?.restoreStatus ?? restoreStatus;
        const nextIndexWorkerStatus = filters?.indexWorkerStatus ?? indexWorkerStatus;
        const nextAuditDeliveryStatus =
          filters?.auditDeliveryStatus ?? auditDeliveryStatus;
        const nextAttachmentSecurityStatus =
          filters?.attachmentSecurityStatus ?? attachmentSecurityStatus;

        const backupParams = new URLSearchParams({ limit: "10" });
        if (nextBackupStatus !== "all") backupParams.set("status", nextBackupStatus);
        if (nextBackupMode !== "all") backupParams.set("mode", nextBackupMode);

        const restoreParams = new URLSearchParams({ limit: "10" });
        if (nextRestoreStatus !== "all") restoreParams.set("status", nextRestoreStatus);

        const indexWorkerParams = new URLSearchParams({ limit: "10" });
        if (nextIndexWorkerStatus !== "all") {
          indexWorkerParams.set("status", nextIndexWorkerStatus);
        }

        const auditDeliveryParams = new URLSearchParams({ limit: "10" });
        if (nextAuditDeliveryStatus !== "all") {
          auditDeliveryParams.set("status", nextAuditDeliveryStatus);
        }

        const attachmentSecurityParams = new URLSearchParams({ limit: "10" });
        if (nextAttachmentSecurityStatus !== "all") {
          attachmentSecurityParams.set("status", nextAttachmentSecurityStatus);
        }

        const [
          overviewRes,
          backupsRes,
          restoreRes,
          indexWorkersRes,
          auditDeliveriesRes,
          attachmentSecurityRes,
        ] = await Promise.all([
          fetch("/api/admin/ops/overview"),
          fetch(`/api/admin/ops/backups?${backupParams.toString()}`),
          fetch(`/api/admin/ops/restore-drills?${restoreParams.toString()}`),
          fetch(`/api/admin/ops/index-workers?${indexWorkerParams.toString()}`),
          fetch(`/api/admin/ops/audit-log-deliveries?${auditDeliveryParams.toString()}`),
          fetch(`/api/admin/ops/attachments?${attachmentSecurityParams.toString()}`),
        ]);

        if (overviewRes.status === 401) {
          router.push("/login");
          return;
        }
        if (overviewRes.status === 403) {
          router.push("/workspace");
          return;
        }
        if (
          !overviewRes.ok ||
          !backupsRes.ok ||
          !restoreRes.ok ||
          !indexWorkersRes.ok ||
          !auditDeliveriesRes.ok ||
          !attachmentSecurityRes.ok
        ) {
          throw new Error("운영 데이터를 불러오지 못했습니다.");
        }

        const overviewData = (await overviewRes.json()) as { summary: OverviewSummary };
        const backupData = (await backupsRes.json()) as { data: BackupRunEntry[] };
        const restoreData = (await restoreRes.json()) as { data: RestoreDrillEntry[] };
        const indexWorkerData = (await indexWorkersRes.json()) as { data: IndexWorkerRunEntry[] };
        const auditDeliveryData = (await auditDeliveriesRes.json()) as {
          data: AuditDeliveryEntry[];
        };
        const attachmentSecurityData = (await attachmentSecurityRes.json()) as {
          data: AttachmentSecurityEntry[];
        };

        setOverview(overviewData.summary);
        setBackups(backupData.data);
        setRestoreDrills(restoreData.data);
        setIndexWorkers(indexWorkerData.data);
        setAuditDeliveries(auditDeliveryData.data);
        setAttachmentSecurityItems(attachmentSecurityData.data);
      } catch (fetchError) {
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "운영 데이터를 불러오지 못했습니다."
        );
      } finally {
        setLoading(false);
      }
    },
    [
      auditDeliveryStatus,
      backupMode,
      backupStatus,
      restoreStatus,
      indexWorkerStatus,
      attachmentSecurityStatus,
      router,
    ]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refreshVectorStoreStatus = useCallback(async () => {
    setVectorStoreRefreshing(true);

    try {
      const res = await fetch("/api/admin/ops/vector-store-status?refresh=1");
      const data = (await res.json().catch(() => null)) as
        | { error?: string; status?: OverviewSummary["vectorStoreStatus"] }
        | null;
      if (!res.ok || !data?.status) {
        throw new Error(data?.error || "Vector store 상태를 새로고침하지 못했습니다.");
      }

      const nextStatus = data.status;

      setOverview((current) =>
        current
          ? {
              ...current,
              vectorStoreStatus: nextStatus,
            }
          : current
      );
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Vector store 상태를 새로고침하지 못했습니다."
      );
    } finally {
      setVectorStoreRefreshing(false);
    }
  }, []);

  const runAttachmentAction = useCallback(
    async (attachmentId: string, action: "release" | "reblock" | "rescan") => {
      setAttachmentActionId(`${action}:${attachmentId}`);

      try {
        const res = await fetch(`/api/admin/ops/attachments/${attachmentId}/${action}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify({}),
        });
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        if (!res.ok) {
          throw new Error(data?.error || "첨부 보안 작업을 처리하지 못했습니다.");
        }

        await fetchData({ attachmentSecurityStatus });
      } catch (actionError) {
        setError(
          actionError instanceof Error
            ? actionError.message
            : "첨부 보안 작업을 처리하지 못했습니다."
        );
      } finally {
        setAttachmentActionId(null);
      }
    },
    [attachmentSecurityStatus, fetchData]
  );

  return (
    <div className="min-h-screen max-w-6xl mx-auto p-6 md:p-10">
      <div className="flex items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/workspace")}
            className="p-2 rounded hover:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold">운영 대시보드</h1>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              백업, 복구 검증, 실행 상태를 서비스 전역 기준으로 확인합니다.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/admin/users")}
            className="flex items-center gap-2 px-4 py-2 rounded text-sm"
            style={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)" }}
          >
            <Users size={14} />
            사용자 관리
          </button>
          <button
            onClick={() => router.push("/admin/workspaces")}
            className="flex items-center gap-2 px-4 py-2 rounded text-sm"
            style={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)" }}
          >
            <Layers size={14} />
            워크스페이스 관리
          </button>
          <button
            onClick={() => router.push("/admin/audit-logs")}
            className="flex items-center gap-2 px-4 py-2 rounded text-sm"
            style={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)" }}
          >
            <ScrollText size={14} />
            감사 로그
          </button>
          <button
            onClick={() => router.push("/admin/infrastructure")}
            className="flex items-center gap-2 px-4 py-2 rounded text-sm"
            style={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)" }}
          >
            <Server size={14} />
            인프라 대시보드
          </button>
          <button
            onClick={() => fetchData()}
            className="flex items-center gap-2 px-4 py-2 rounded text-sm text-white"
            style={{ background: "var(--primary)" }}
          >
            <RefreshCw size={14} />
            새로고침
          </button>
        </div>
      </div>

      {error && (
        <div
          className="mb-6 rounded-lg px-4 py-3 text-sm"
          style={{ background: "rgba(239,68,68,0.1)", color: "rgba(153,27,27,0.9)" }}
        >
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-9 mb-8">
        <StatCard
          icon={<HardDriveDownload size={16} />}
          label="최근 성공 백업"
          value={overview?.latestSuccessfulBackup ? formatDateTime(overview.latestSuccessfulBackup.finishedAt || overview.latestSuccessfulBackup.startedAt) : "-"}
          hint={overview?.latestSuccessfulBackup?.summary?.totalBytes ? `크기 ${formatBytes(overview.latestSuccessfulBackup.summary.totalBytes)}` : "백업 기록 없음"}
        />
        <StatCard
          icon={<ShieldCheck size={16} />}
          label="최근 복구 검증"
          value={overview?.latestSuccessfulRestoreDrill ? formatDateTime(overview.latestSuccessfulRestoreDrill.finishedAt || overview.latestSuccessfulRestoreDrill.startedAt) : "-"}
          hint={overview?.latestSuccessfulRestoreDrill?.summary?.verifiedArtifactCount ? `검증 ${overview.latestSuccessfulRestoreDrill.summary.verifiedArtifactCount}개` : "복구 검증 기록 없음"}
        />
        <StatCard
          icon={<Database size={16} />}
          label="실행 중 백업"
          value={String(overview?.runningBackupCount ?? 0)}
          hint={`실패 ${overview?.failedBackupCount ?? 0}건`}
        />
        <StatCard
          icon={<Activity size={16} />}
          label="실행 중 복구 검증"
          value={String(overview?.runningRestoreDrillCount ?? 0)}
          hint={`실패 ${overview?.failedRestoreDrillCount ?? 0}건`}
        />
        <StatCard
          icon={<RefreshCw size={16} />}
          label="검색 인덱싱 워커"
          value={String(overview?.runningIndexWorkerCount ?? 0)}
          hint={
            overview?.latestSuccessfulIndexWorker?.summary?.processedJobCount
              ? `최근 처리 ${overview.latestSuccessfulIndexWorker.summary.processedJobCount}건`
              : `실패 ${overview?.failedIndexWorkerCount ?? 0}건`
          }
        />
        <StatCard
          icon={<ShieldCheck size={16} />}
          label="감사 로그 SIEM"
          value={String(overview?.auditWebhookStatus.pendingCount ?? 0)}
          hint={
            overview?.auditWebhookStatus?.enabled
              ? `오류 ${overview.auditWebhookStatus.errorCount}건`
              : "웹훅 비활성"
          }
        />
        <StatCard
          icon={<ShieldCheck size={16} />}
          label="업로드 보안"
          value={overview?.uploadSecurityStatus?.malwareScanMode || "-"}
          hint={
            overview?.uploadSecurityStatus
              ? `ClamAV ${overview.uploadSecurityStatus.clamavConfigured ? "설정됨" : "미설정"} / DLP ${overview.uploadSecurityStatus.dlpScanMode}`
              : "상태 없음"
          }
        />
        <StatCard
          icon={<ShieldCheck size={16} />}
          label="격리 첨부"
          value={String(overview?.attachmentSecurityQueue?.quarantinedCount ?? 0)}
          hint={
            overview?.attachmentSecurityQueue
              ? `수동 허용 ${overview.attachmentSecurityQueue.releasedCount}건 / 경고 ${overview.attachmentSecurityQueue.warningCount}건`
              : "상태 없음"
          }
        />
        <StatCard
          icon={<Database size={16} />}
          label="Vector Store"
          value={
            overview?.vectorStoreStatus
              ? getVectorBackendLabel(overview.vectorStoreStatus.effectiveReadBackend)
              : "-"
          }
          hint={
            overview?.vectorStoreStatus
              ? overview.vectorStoreStatus.fallbackActive
                ? `fallback ${
                    overview.vectorStoreStatus.configuredBackend === "pgvector"
                      ? overview.vectorStoreStatus.pgvector.lastErrorCode || ""
                      : overview.vectorStoreStatus.qdrant.lastErrorCode || ""
                  }`.trim()
                : `설정 ${getConfiguredBackendLabel(overview.vectorStoreStatus.configuredBackend)}`
              : "상태 없음"
          }
        />
      </div>

      {overview?.vectorStoreStatus && (
        <section
          className="mb-8 rounded-xl p-4"
          style={{
            background: "var(--sidebar-bg)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Semantic Vector Store</h2>
              <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
                검색이 실제로 읽는 backend와 외부 벡터 인덱스 runtime 상태입니다.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void refreshVectorStoreStatus()}
                disabled={vectorStoreRefreshing}
                className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm"
                style={{
                  background: "var(--background)",
                  border: "1px solid var(--border)",
                  opacity: vectorStoreRefreshing ? 0.7 : 1,
                }}
              >
                <RefreshCw size={14} />
                상태 재검사
              </button>
              <span
                className="rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  background: overview.vectorStoreStatus.fallbackActive ? "rgba(251,146,60,0.08)" : "rgba(34,197,94,0.1)",
                  color: overview.vectorStoreStatus.fallbackActive ? "rgba(154,52,18,0.9)" : "rgba(22,101,52,0.9)",
                }}
              >
                {overview.vectorStoreStatus.fallbackActive
                  ? "JSON fallback active"
                  : getVectorBackendLabel(overview.vectorStoreStatus.effectiveReadBackend)}
              </span>
            </div>
          </div>

          <div className="grid gap-3 mt-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="설정 backend"
              value={getConfiguredBackendLabel(overview.vectorStoreStatus.configuredBackend)}
            />
            <MetricCard
              label="실제 읽기 backend"
              value={getVectorBackendLabel(overview.vectorStoreStatus.effectiveReadBackend)}
            />
            <MetricCard
              label="JSON chunk"
              value={String(overview.vectorStoreStatus.counts.jsonChunkCount)}
            />
            <MetricCard
              label="Vector chunk"
              value={
                overview.vectorStoreStatus.counts.vectorChunkCount === null
                  ? "-"
                  : String(overview.vectorStoreStatus.counts.vectorChunkCount)
              }
            />
          </div>

          <div className="grid gap-2 mt-4 text-xs md:grid-cols-2" style={{ color: "var(--muted)" }}>
            <div>
              Auto init{" "}
              {overview.vectorStoreStatus.configuredBackend === "pgvector"
                ? overview.vectorStoreStatus.pgvector.autoInitEnabled
                  ? "ON"
                  : "OFF"
                : overview.vectorStoreStatus.configuredBackend === "qdrant"
                  ? overview.vectorStoreStatus.qdrant.autoInitEnabled
                    ? "ON"
                    : "OFF"
                  : "-"}
            </div>
            <div>
              {overview.vectorStoreStatus.configuredBackend === "pgvector"
                ? `Helper table ${overview.vectorStoreStatus.helperTable || "-"}`
                : overview.vectorStoreStatus.configuredBackend === "qdrant"
                  ? `Collection prefix ${overview.vectorStoreStatus.qdrant.collectionPrefix}`
                  : "외부 인덱스 사용 안 함"}
            </div>
            <div>
              최근 점검{" "}
              {formatDateTime(
                overview.vectorStoreStatus.configuredBackend === "pgvector"
                  ? overview.vectorStoreStatus.pgvector.checkedAt
                  : overview.vectorStoreStatus.configuredBackend === "qdrant"
                    ? overview.vectorStoreStatus.qdrant.checkedAt
                    : null
              )}
            </div>
            <div>
              {getConfiguredBackendLabel(overview.vectorStoreStatus.configuredBackend)} 상태{" "}
              {overview.vectorStoreStatus.configuredBackend === "pgvector"
                ? overview.vectorStoreStatus.pgvector.ready
                  ? "정상"
                  : "미사용 / 실패"
                : overview.vectorStoreStatus.configuredBackend === "qdrant"
                  ? overview.vectorStoreStatus.qdrant.ready
                    ? "정상"
                    : "미사용 / 실패"
                  : "JSON only"}
              {(overview.vectorStoreStatus.configuredBackend === "pgvector"
                ? overview.vectorStoreStatus.pgvector.lastErrorCode
                : overview.vectorStoreStatus.qdrant.lastErrorCode)
                ? ` (${
                    overview.vectorStoreStatus.configuredBackend === "pgvector"
                      ? overview.vectorStoreStatus.pgvector.lastErrorCode
                      : overview.vectorStoreStatus.qdrant.lastErrorCode
                  })`
                : ""}
            </div>
            {overview.vectorStoreStatus.configuredBackend === "qdrant" && (
              <div>
                Qdrant collections {String(overview.vectorStoreStatus.qdrant.collectionCount)}
              </div>
            )}
          </div>

          {overview.vectorStoreStatus.fallbackActive &&
            (overview.vectorStoreStatus.configuredBackend === "pgvector"
              ? overview.vectorStoreStatus.pgvector.lastError
              : overview.vectorStoreStatus.qdrant.lastError) && (
              <div
                className="mt-3 rounded-lg px-3 py-2 text-xs"
                style={{ background: "rgba(251,146,60,0.08)", color: "rgba(154,52,18,0.9)" }}
              >
                {overview.vectorStoreStatus.configuredBackend === "pgvector"
                  ? overview.vectorStoreStatus.pgvector.lastError
                  : overview.vectorStoreStatus.qdrant.lastError}
              </div>
            )}
        </section>
      )}

      <section
        className="mb-8 rounded-xl p-4"
        style={{
          background: "var(--sidebar-bg)",
          border: "1px solid var(--border)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold">첨부 격리 검토</h2>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
              차단되었거나 경고 상태인 첨부를 재검사하고, 필요 시 수동 허용 또는 다시
              격리합니다.
            </p>
          </div>
          <div className="flex gap-2">
            <select
              value={attachmentSecurityStatus}
              onChange={(e) => {
                const value = e.target.value;
                setAttachmentSecurityStatus(value);
                fetchData({ attachmentSecurityStatus: value });
              }}
              className="px-3 py-2 rounded text-sm"
              style={{ background: "var(--background)", border: "1px solid var(--border)" }}
            >
              <option value="quarantined">격리</option>
              <option value="released">수동 허용</option>
              <option value="warning">경고</option>
            </select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4 mb-4">
          <MetricCard
            label="격리"
            value={String(overview?.attachmentSecurityQueue?.quarantinedCount ?? 0)}
          />
          <MetricCard
            label="수동 허용"
            value={String(overview?.attachmentSecurityQueue?.releasedCount ?? 0)}
          />
          <MetricCard
            label="경고"
            value={String(overview?.attachmentSecurityQueue?.warningCount ?? 0)}
          />
          <MetricCard
            label="최근 검토"
            value={formatDateTime(overview?.attachmentSecurityQueue?.latestReview?.reviewedAt || null)}
          />
        </div>

        <div className="space-y-3">
          {loading ? (
            <EmptyState text="첨부 보안 대기열을 불러오는 중입니다..." />
          ) : attachmentSecurityItems.length === 0 ? (
            <EmptyState text="표시할 첨부 보안 대기열이 없습니다." />
          ) : (
            attachmentSecurityItems.map((attachment) => {
              const stateStyle = getAttachmentSecurityState(attachment);
              const actionKeyPrefix = `${attachment.id}`;

              return (
                <div
                  key={attachment.id}
                  className="rounded-xl p-4"
                  style={{
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="text-sm font-semibold">{attachment.filename}</div>
                        <span
                          className="text-xs px-2 py-1 rounded"
                          style={{
                            background: stateStyle.background,
                            color: stateStyle.color,
                          }}
                        >
                          {stateStyle.label}
                        </span>
                      </div>
                      <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                        {attachment.page.workspace.name} / {attachment.page.title}
                      </div>
                      <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                        {attachment.mimeType} · {formatBytes(String(attachment.size))} · 검사{" "}
                        {formatDateTime(attachment.securityCheckedAt)}
                      </div>
                      {attachment.securityScanner && (
                        <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                          스캐너 {attachment.securityScanner}
                        </div>
                      )}
                      {attachment.securityFindings?.[0]?.message && (
                        <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                          {attachment.securityFindings[0].message}
                        </div>
                      )}
                      {(attachment.reviewedBy || attachment.securityReviewNote) && (
                        <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>
                          검토 {attachment.reviewedBy?.email || attachment.reviewedBy?.name || "-"} /{" "}
                          {formatDateTime(attachment.securityReviewedAt)}
                          {attachment.securityReviewNote
                            ? ` / 메모 ${attachment.securityReviewNote}`
                            : ""}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <button
                        onClick={() => void runAttachmentAction(attachment.id, "rescan")}
                        disabled={attachmentActionId === `rescan:${actionKeyPrefix}`}
                        className="px-3 py-2 rounded text-sm"
                        style={{
                          background: "var(--background)",
                          border: "1px solid var(--border)",
                          opacity:
                            attachmentActionId === `rescan:${actionKeyPrefix}` ? 0.7 : 1,
                        }}
                      >
                        재검사
                      </button>
                      {attachment.securityStatus === "blocked" &&
                        attachment.securityDisposition !== "released" && (
                          <button
                            onClick={() => void runAttachmentAction(attachment.id, "release")}
                            disabled={attachmentActionId === `release:${actionKeyPrefix}`}
                            className="px-3 py-2 rounded text-sm text-white"
                            style={{
                              background: "rgba(29,78,216,0.9)",
                              opacity:
                                attachmentActionId === `release:${actionKeyPrefix}`
                                  ? 0.7
                                  : 1,
                            }}
                          >
                            수동 허용
                          </button>
                        )}
                      {attachment.securityStatus === "blocked" &&
                        attachment.securityDisposition === "released" && (
                          <button
                            onClick={() => void runAttachmentAction(attachment.id, "reblock")}
                            disabled={attachmentActionId === `reblock:${actionKeyPrefix}`}
                            className="px-3 py-2 rounded text-sm"
                            style={{
                              background: "rgba(239,68,68,0.1)",
                              color: "rgba(153,27,27,0.9)",
                              opacity:
                                attachmentActionId === `reblock:${actionKeyPrefix}`
                                  ? 0.7
                                  : 1,
                            }}
                          >
                            다시 격리
                          </button>
                        )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold">백업 실행 이력</h2>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                `backup:run` 결과와 아티팩트 checksum을 확인합니다.
              </p>
            </div>
            <div className="flex gap-2">
              <select
                value={backupStatus}
                onChange={(e) => {
                  const value = e.target.value;
                  setBackupStatus(value);
                  fetchData({ backupStatus: value });
                }}
                className="px-3 py-2 rounded text-sm"
                style={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)" }}
              >
                <option value="all">전체 상태</option>
                <option value="running">실행 중</option>
                <option value="success">성공</option>
                <option value="error">오류</option>
              </select>
              <select
                value={backupMode}
                onChange={(e) => {
                  const value = e.target.value;
                  setBackupMode(value);
                  fetchData({ backupMode: value });
                }}
                className="px-3 py-2 rounded text-sm"
                style={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)" }}
              >
                <option value="all">전체 모드</option>
                <option value="execute">실행</option>
                <option value="dry_run">Dry Run</option>
              </select>
            </div>
          </div>

          <div className="space-y-4">
            {loading ? (
              <EmptyState text="백업 이력을 불러오는 중입니다..." />
            ) : backups.length === 0 ? (
              <EmptyState text="표시할 백업 이력이 없습니다." />
            ) : (
              backups.map((run) => {
                const statusStyle = getStatusStyle(run.status);
                const summaryWarnings = Array.isArray(run.summary?.warnings)
                  ? (run.summary?.warnings as string[])
                  : [];

                return (
                  <div
                    key={run.id}
                    className="rounded-xl p-4"
                    style={{
                      background: "var(--sidebar-bg)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">
                          {run.mode === "dry_run" ? "Dry Run" : "실행"} / {run.trigger}
                        </div>
                        <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                          시작 {formatDateTime(run.startedAt)} / 완료 {formatDateTime(run.finishedAt)}
                        </div>
                        <div className="text-xs mt-1 break-all" style={{ color: "var(--muted)" }}>
                          경로: {run.destinationPath || run.backupRootDir}
                        </div>
                      </div>
                      <span
                        className="text-xs px-2 py-1 rounded"
                        style={{ background: statusStyle.background, color: statusStyle.color }}
                      >
                        {statusStyle.label}
                      </span>
                    </div>

                    <div
                      className="grid gap-2 mt-3 text-xs md:grid-cols-2"
                      style={{ color: "var(--muted)" }}
                    >
                      <div>아티팩트 {run.artifactCount}개</div>
                      <div>복구 검증 {run.restoreDrillCount}회</div>
                      <div>
                        총 크기 {formatBytes(run.summary?.totalBytes as string | undefined)}
                      </div>
                      <div>실행 ID {run.id}</div>
                    </div>

                    {run.errorMessage && (
                      <p className="text-xs mt-3 text-red-500">{run.errorMessage}</p>
                    )}

                    {summaryWarnings.length > 0 && (
                      <div className="mt-3 text-xs" style={{ color: "rgba(146,64,14,0.9)" }}>
                        경고: {summaryWarnings.join(" | ")}
                      </div>
                    )}

                    {run.latestRestoreDrill && (
                      <div className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
                        최근 복구 검증: {run.latestRestoreDrill.status} / {formatDateTime(run.latestRestoreDrill.finishedAt || run.latestRestoreDrill.startedAt)}
                      </div>
                    )}

                    <details className="mt-3">
                      <summary className="text-xs cursor-pointer" style={{ color: "var(--muted)" }}>
                        아티팩트 및 메타데이터 보기
                      </summary>
                      <div className="space-y-2 mt-3">
                        {run.artifacts.map((artifact) => (
                          <div
                            key={artifact.id}
                            className="rounded p-3 text-xs"
                            style={{
                              background: "var(--background)",
                              border: "1px solid var(--border)",
                            }}
                          >
                            <div className="font-medium">{artifact.kind}</div>
                            <div style={{ color: "var(--muted)" }}>
                              {artifact.filePath || "-"}
                            </div>
                            <div className="mt-1" style={{ color: "var(--muted)" }}>
                              크기 {formatBytes(artifact.sizeBytes || undefined)} / 상태 {artifact.status}
                            </div>
                            {artifact.checksumSha256 && (
                              <code className="block mt-2 break-all">{artifact.checksumSha256}</code>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold">복구 검증 이력</h2>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                `restore-drill:run` 결과와 repo fsck 검증 상태입니다.
              </p>
            </div>
            <select
              value={restoreStatus}
              onChange={(e) => {
                const value = e.target.value;
                setRestoreStatus(value);
                fetchData({ restoreStatus: value });
              }}
              className="px-3 py-2 rounded text-sm"
              style={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)" }}
            >
              <option value="all">전체 상태</option>
              <option value="running">실행 중</option>
              <option value="success">성공</option>
              <option value="error">오류</option>
            </select>
          </div>

          <div className="space-y-4">
            {loading ? (
              <EmptyState text="복구 검증 이력을 불러오는 중입니다..." />
            ) : restoreDrills.length === 0 ? (
              <EmptyState text="표시할 복구 검증 이력이 없습니다." />
            ) : (
              restoreDrills.map((run) => {
                const statusStyle = getStatusStyle(run.status);
                const warningList = Array.isArray(run.summary?.warnings)
                  ? (run.summary?.warnings as string[])
                  : [];

                return (
                  <div
                    key={run.id}
                    className="rounded-xl p-4"
                    style={{
                      background: "var(--sidebar-bg)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">백업 {run.backupRunId}</div>
                        <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                          시작 {formatDateTime(run.startedAt)} / 완료 {formatDateTime(run.finishedAt)}
                        </div>
                        <div className="text-xs mt-1 break-all" style={{ color: "var(--muted)" }}>
                          대상 경로: {run.backupRun.destinationPath || "-"}
                        </div>
                      </div>
                      <span
                        className="text-xs px-2 py-1 rounded"
                        style={{ background: statusStyle.background, color: statusStyle.color }}
                      >
                        {statusStyle.label}
                      </span>
                    </div>

                    <div
                      className="grid gap-2 mt-3 text-xs"
                      style={{ color: "var(--muted)" }}
                    >
                      <div>
                        검증 아티팩트 {(run.summary?.verifiedArtifactCount as number | undefined) ?? 0}개
                      </div>
                      <div>
                        repo fsck {(run.summary?.repoFsckPassedCount as number | undefined) ?? 0}개 통과
                      </div>
                    </div>

                    {run.errorMessage && (
                      <p className="text-xs mt-3 text-red-500">{run.errorMessage}</p>
                    )}

                    {warningList.length > 0 && (
                      <div className="mt-3 text-xs" style={{ color: "rgba(146,64,14,0.9)" }}>
                        경고: {warningList.join(" | ")}
                      </div>
                    )}

                    {run.summary && (
                      <details className="mt-3">
                        <summary className="text-xs cursor-pointer" style={{ color: "var(--muted)" }}>
                          검증 상세 보기
                        </summary>
                        <pre
                          className="mt-2 text-xs p-3 rounded overflow-x-auto"
                          style={{
                            background: "var(--background)",
                            border: "1px solid var(--border)",
                          }}
                        >
                          {JSON.stringify(run.summary, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold">검색 인덱싱 워커 이력</h2>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                `semantic:index-jobs`와 수동 큐 처리 실행 결과입니다.
              </p>
            </div>
            <select
              value={indexWorkerStatus}
              onChange={(e) => {
                const value = e.target.value;
                setIndexWorkerStatus(value);
                fetchData({ indexWorkerStatus: value });
              }}
              className="px-3 py-2 rounded text-sm"
              style={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)" }}
            >
              <option value="all">전체 상태</option>
              <option value="running">실행 중</option>
              <option value="success">성공</option>
              <option value="error">오류</option>
            </select>
          </div>

          <div className="space-y-4">
            {loading ? (
              <EmptyState text="검색 인덱싱 워커 이력을 불러오는 중입니다..." />
            ) : indexWorkers.length === 0 ? (
              <EmptyState text="표시할 검색 인덱싱 워커 이력이 없습니다." />
            ) : (
              indexWorkers.map((run) => {
                const statusStyle = getStatusStyle(run.status);
                const runSummary = run.summary || {};

                return (
                  <div
                    key={run.id}
                    className="rounded-xl p-4"
                    style={{
                      background: "var(--sidebar-bg)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">
                          {run.trigger} / {run.workspaceScopeId ? `workspace ${run.workspaceScopeId}` : "global"}
                        </div>
                        <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                          시작 {formatDateTime(run.startedAt)} / 완료 {formatDateTime(run.finishedAt)}
                        </div>
                        <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                          limit {run.limit ?? "-"} / 워크스페이스 {(runSummary.workspaceCount as number | undefined) ?? run.workspaceRuns.length}개
                        </div>
                      </div>
                      <span
                        className="text-xs px-2 py-1 rounded"
                        style={{ background: statusStyle.background, color: statusStyle.color }}
                      >
                        {statusStyle.label}
                      </span>
                    </div>

                    <div
                      className="grid gap-2 mt-3 text-xs md:grid-cols-2"
                      style={{ color: "var(--muted)" }}
                    >
                      <div>처리 {(runSummary.processedJobCount as number | undefined) ?? 0}건</div>
                      <div>성공 {(runSummary.successJobCount as number | undefined) ?? 0}건</div>
                      <div>오류 {(runSummary.errorJobCount as number | undefined) ?? 0}건</div>
                      <div>워크스페이스 재색인 {(runSummary.workspaceReindexJobCount as number | undefined) ?? 0}건</div>
                    </div>

                    {run.errorMessage && (
                      <p className="text-xs mt-3 text-red-500">{run.errorMessage}</p>
                    )}

                    <details className="mt-3">
                      <summary className="text-xs cursor-pointer" style={{ color: "var(--muted)" }}>
                        워크스페이스별 처리 내역 보기
                      </summary>
                      <div className="space-y-2 mt-3">
                        {run.workspaceRuns.length === 0 ? (
                          <div className="text-xs" style={{ color: "var(--muted)" }}>
                            기록된 워크스페이스 요약이 없습니다.
                          </div>
                        ) : (
                          run.workspaceRuns.map((entry) => (
                            <div
                              key={entry.id}
                              className="rounded p-3 text-xs"
                              style={{
                                background: "var(--background)",
                                border: "1px solid var(--border)",
                              }}
                            >
                              <div className="font-medium">
                                {entry.workspaceName} ({entry.workspaceSlug})
                              </div>
                              <div className="mt-1" style={{ color: "var(--muted)" }}>
                                처리 {entry.processedJobCount}건 / 성공 {entry.successJobCount}건 / 오류 {entry.errorJobCount}건
                              </div>
                              <div className="mt-1" style={{ color: "var(--muted)" }}>
                                페이지 재색인 {entry.pageReindexJobCount}건 / 워크스페이스 재색인 {entry.workspaceReindexJobCount}건
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </details>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold">감사 로그 전달 이력</h2>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                외부 SIEM/웹훅 전달 상태와 재시도 큐를 확인합니다.
              </p>
            </div>
            <select
              value={auditDeliveryStatus}
              onChange={(e) => {
                const value = e.target.value;
                setAuditDeliveryStatus(value);
                fetchData({ auditDeliveryStatus: value });
              }}
              className="px-3 py-2 rounded text-sm"
              style={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)" }}
            >
              <option value="all">전체 상태</option>
              <option value="pending">대기/재시도</option>
              <option value="delivered">전달 완료</option>
              <option value="error">최종 실패</option>
            </select>
          </div>

          <div
            className="rounded-xl p-4 mb-4"
            style={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)" }}
          >
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="웹훅 상태"
                value={overview?.auditWebhookStatus.enabled ? "활성" : "비활성"}
              />
              <MetricCard
                label="전달 완료"
                value={String(overview?.auditWebhookStatus.deliveredCount ?? 0)}
              />
              <MetricCard
                label="대기/재시도"
                value={String(overview?.auditWebhookStatus.pendingCount ?? 0)}
              />
              <MetricCard
                label="최종 실패"
                value={String(overview?.auditWebhookStatus.errorCount ?? 0)}
              />
            </div>

            <div className="grid gap-2 mt-4 text-xs md:grid-cols-2" style={{ color: "var(--muted)" }}>
              <div>Label {overview?.auditWebhookStatus.label || "-"}</div>
              <div>URL 설정 {overview?.auditWebhookStatus.urlConfigured ? "예" : "아니오"}</div>
              <div>배치 크기 {overview?.auditWebhookStatus.batchLimit ?? "-"}</div>
              <div>최대 재시도 {overview?.auditWebhookStatus.maxAttempts ?? "-"}</div>
              <div>타임아웃 {overview?.auditWebhookStatus.timeoutMs ?? "-"}ms</div>
              <div>
                최근 전달{" "}
                {formatDateTime(overview?.auditWebhookStatus.latestDelivered?.deliveredAt || null)}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {loading ? (
              <EmptyState text="감사 로그 전달 이력을 불러오는 중입니다..." />
            ) : auditDeliveries.length === 0 ? (
              <EmptyState text="표시할 감사 로그 전달 이력이 없습니다." />
            ) : (
              auditDeliveries.map((delivery) => {
                const statusStyle = getStatusStyle(
                  delivery.status === "delivered" ? "success" : delivery.status === "pending" ? "running" : "error"
                );

                return (
                  <div
                    key={delivery.id}
                    className="rounded-xl p-4"
                    style={{
                      background: "var(--sidebar-bg)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">
                          {delivery.auditLog.action} / {delivery.destinationLabel}
                        </div>
                        <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                          생성 {formatDateTime(delivery.createdAt)} / 전달 {formatDateTime(delivery.deliveredAt)}
                        </div>
                        <div className="text-xs mt-1 break-all" style={{ color: "var(--muted)" }}>
                          actor {delivery.auditLog.actorEmail || "-"} / workspace {delivery.auditLog.workspaceId || "-"}
                        </div>
                      </div>
                      <span
                        className="text-xs px-2 py-1 rounded"
                        style={{ background: statusStyle.background, color: statusStyle.color }}
                      >
                        {delivery.status === "delivered"
                          ? "전달 완료"
                          : delivery.status === "pending"
                            ? "대기/재시도"
                            : "최종 실패"}
                      </span>
                    </div>

                    <div
                      className="grid gap-2 mt-3 text-xs md:grid-cols-2"
                      style={{ color: "var(--muted)" }}
                    >
                      <div>시도 {delivery.attempts}회</div>
                      <div>다음 시도 {formatDateTime(delivery.nextAttemptAt)}</div>
                      <div>응답 코드 {delivery.responseStatus ?? "-"}</div>
                      <div>페이지 {delivery.auditLog.pageId || "-"}</div>
                    </div>

                    {delivery.lastError && (
                      <p className="text-xs mt-3 text-red-500">{delivery.lastError}</p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      <div
        className="mt-8 rounded-xl p-4 text-sm"
        style={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)" }}
      >
        <div className="font-medium mb-2">운영 명령</div>
        <code className="block text-xs break-all">bun run backup:run --dry-run</code>
        <code className="block text-xs break-all mt-2">bun run backup:run --trigger=scheduled</code>
        <code className="block text-xs break-all mt-2">bun run restore-drill:run</code>
        <code className="block text-xs break-all mt-2">bun run upload-security:smoke</code>
        <code className="block text-xs break-all mt-2">bun run upload-dlp:smoke</code>
        <code className="block text-xs break-all mt-2">bun run upload-security:clamav:smoke</code>
        <code className="block text-xs break-all mt-2">bun run attachment-security:rescan --limit=50</code>
        <code className="block text-xs break-all mt-2">bun run audit-log:deliveries --trigger=scheduled --limit=50</code>
        <code className="block text-xs break-all mt-2">bun run semantic:reindex --dry-run --workspace-id=&lt;workspace_id&gt;</code>
        <code className="block text-xs break-all mt-2">bun run semantic:reindex --trigger=scheduled</code>
        <code className="block text-xs break-all mt-2">bun run semantic:index-jobs --trigger=scheduled --limit=50</code>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
        {icon}
        {label}
      </div>
      <div className="text-xl font-semibold mt-3">{value}</div>
      <div className="text-xs mt-2" style={{ color: "var(--muted)" }}>
        {hint}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg px-3 py-3"
      style={{ background: "var(--background)", border: "1px solid var(--border)" }}
    >
      <div className="text-xs" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div
      className="rounded-xl px-4 py-8 text-sm text-center"
      style={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)", color: "var(--muted)" }}
    >
      {text}
    </div>
  );
}
