"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Database,
  HardDrive,
  Key,
  RefreshCw,
  Server,
  Shield,
  Wifi,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ComponentHealth {
  status: "healthy" | "unhealthy" | "disabled";
  latencyMs: number | null;
  version: string | null;
  error: string | null;
  config: Record<string, string | number | boolean>;
}

interface InfrastructureHealthResult {
  postgres: ComponentHealth;
  redis: ComponentHealth;
  minio: ComponentHealth;
  clamav: ComponentHealth;
  qdrant: ComponentHealth;
  keycloak: ComponentHealth;
  checkedAt: string;
}

interface StorageStats {
  postgres: {
    databaseSize: string | null;
    connectionCount: number | null;
  };
  redis: {
    usedMemory: string | null;
    usedMemoryHuman: string | null;
    totalKeys: number | null;
  };
  minio: {
    enabled: boolean;
    bucket: string | null;
  };
  qdrant: {
    enabled: boolean;
    collectionCount: number | null;
    totalPoints: number | null;
  };
  checkedAt: string;
}

// ---------------------------------------------------------------------------
// Service metadata
// ---------------------------------------------------------------------------

interface ServiceMeta {
  key: keyof InfrastructureHealthResult;
  label: string;
  icon: React.ReactNode;
}

const SERVICES: ServiceMeta[] = [
  { key: "postgres", label: "PostgreSQL", icon: <Database size={18} /> },
  { key: "redis", label: "Redis", icon: <Wifi size={18} /> },
  { key: "minio", label: "MinIO / S3", icon: <HardDrive size={18} /> },
  { key: "clamav", label: "ClamAV", icon: <Shield size={18} /> },
  { key: "qdrant", label: "Qdrant", icon: <Activity size={18} /> },
  { key: "keycloak", label: "Keycloak", icon: <Key size={18} /> },
];

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function getHealthBadgeStyle(status: "healthy" | "unhealthy" | "disabled") {
  switch (status) {
    case "healthy":
      return { background: "#22c55e", color: "#ffffff", label: "정상" };
    case "unhealthy":
      return { background: "#ef4444", color: "#ffffff", label: "비정상" };
    case "disabled":
      return { background: "var(--muted)", color: "var(--background)", label: "비활성" };
  }
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function ServiceCard({
  meta,
  health,
}: {
  meta: ServiceMeta;
  health: ComponentHealth;
}) {
  const [expanded, setExpanded] = useState(false);
  const badge = getHealthBadgeStyle(health.status);
  const configEntries = Object.entries(health.config);

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <span style={{ color: "var(--muted)" }}>{meta.icon}</span>
          <div>
            <div className="font-semibold text-sm">{meta.label}</div>
            {health.version && (
              <div className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
                {health.version}
              </div>
            )}
          </div>
        </div>
        <span
          className="rounded-full px-3 py-1 text-xs font-medium"
          style={{ background: badge.background, color: badge.color }}
        >
          {badge.label}
        </span>
      </div>

      {health.latencyMs !== null && (
        <div className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
          응답 시간: {health.latencyMs}ms
        </div>
      )}

      {health.error && (
        <div
          className="mt-3 rounded px-3 py-2 text-xs"
          style={{ background: "rgba(239,68,68,0.1)", color: "rgba(153,27,27,0.9)" }}
        >
          {health.error}
        </div>
      )}

      {configEntries.length > 0 && (
        <div className="mt-3">
          <button
            className="flex items-center gap-1 text-xs"
            style={{ color: "var(--muted)" }}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            설정 상세
          </button>
          {expanded && (
            <div
              className="mt-2 rounded px-3 py-2 text-xs space-y-1"
              style={{ background: "var(--background)", border: "1px solid var(--border)" }}
            >
              {configEntries.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <span style={{ color: "var(--muted)" }}>{k}</span>
                  <span className="text-right break-all">{String(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StorageMetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div
      className="rounded-lg px-3 py-3"
      style={{ background: "var(--background)", border: "1px solid var(--border)" }}
    >
      <div className="text-xs" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
      {hint && (
        <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export function InfrastructureDashboard() {
  const router = useRouter();
  const [health, setHealth] = useState<InfrastructureHealthResult | null>(null);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [healthRes, storageRes] = await Promise.all([
        fetch("/api/admin/infrastructure/health"),
        fetch("/api/admin/infrastructure/storage-stats"),
      ]);

      if (healthRes.status === 401 || storageRes.status === 401) {
        router.push("/login");
        return;
      }
      if (healthRes.status === 403 || storageRes.status === 403) {
        router.push("/workspace");
        return;
      }
      if (!healthRes.ok || !storageRes.ok) {
        throw new Error("인프라 데이터를 불러오지 못했습니다.");
      }

      const healthData = (await healthRes.json()) as { health: InfrastructureHealthResult };
      const storageData = (await storageRes.json()) as { stats: StorageStats };

      setHealth(healthData.health);
      setStorageStats(storageData.stats);
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "인프라 데이터를 불러오지 못했습니다.",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      void fetchData();
    }, 30_000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchData]);

  const healthyCount = health
    ? SERVICES.filter((s) => {
        const h = health[s.key];
        return h && typeof h === "object" && "status" in h && (h as ComponentHealth).status === "healthy";
      }).length
    : 0;
  const unhealthyCount = health
    ? SERVICES.filter((s) => {
        const h = health[s.key];
        return h && typeof h === "object" && "status" in h && (h as ComponentHealth).status === "unhealthy";
      }).length
    : 0;
  const disabledCount = health
    ? SERVICES.filter((s) => {
        const h = health[s.key];
        return h && typeof h === "object" && "status" in h && (h as ComponentHealth).status === "disabled";
      }).length
    : 0;

  return (
    <div className="min-h-screen max-w-6xl mx-auto p-6 md:p-10">
      {/* Header */}
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
            <h1 className="text-2xl font-bold">인프라 대시보드</h1>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Docker 서비스 및 외부 인프라 컴포넌트의 상태를 실시간으로 모니터링합니다.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/admin/ops")}
            className="flex items-center gap-2 px-4 py-2 rounded text-sm"
            style={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)" }}
          >
            <Server size={14} />
            운영 대시보드
          </button>
          <button
            onClick={() => void fetchData()}
            className="flex items-center gap-2 px-4 py-2 rounded text-sm text-white"
            style={{ background: "var(--primary)" }}
          >
            <RefreshCw size={14} />
            새로고침
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div
          className="mb-6 rounded-lg px-4 py-3 text-sm"
          style={{ background: "rgba(239,68,68,0.1)", color: "rgba(153,27,27,0.9)" }}
        >
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && !health && (
        <div
          className="rounded-xl px-4 py-8 text-sm text-center"
          style={{ background: "var(--sidebar-bg)", border: "1px solid var(--border)", color: "var(--muted)" }}
        >
          인프라 상태를 확인하는 중...
        </div>
      )}

      {/* Summary badges */}
      {health && (
        <div className="flex flex-wrap gap-3 mb-6">
          <span
            className="rounded-full px-3 py-1 text-xs font-medium"
            style={{ background: "rgba(34,197,94,0.1)", color: "rgba(22,101,52,0.9)" }}
          >
            정상 {healthyCount}
          </span>
          {unhealthyCount > 0 && (
            <span
              className="rounded-full px-3 py-1 text-xs font-medium"
              style={{ background: "rgba(239,68,68,0.1)", color: "rgba(153,27,27,0.9)" }}
            >
              비정상 {unhealthyCount}
            </span>
          )}
          <span
            className="rounded-full px-3 py-1 text-xs font-medium"
            style={{ background: "var(--sidebar-bg)", color: "var(--muted)" }}
          >
            비활성 {disabledCount}
          </span>
          {health.checkedAt && (
            <span className="text-xs self-center" style={{ color: "var(--muted)" }}>
              마지막 확인: {new Date(health.checkedAt).toLocaleString("ko-KR")}
            </span>
          )}
        </div>
      )}

      {/* Service grid */}
      {health && (
        <div className="grid gap-4 md:grid-cols-2 mb-8">
          {SERVICES.map((svc) => {
            const h = health[svc.key];
            if (!h || typeof h !== "object" || !("status" in h)) return null;
            return <ServiceCard key={svc.key} meta={svc} health={h as ComponentHealth} />;
          })}
        </div>
      )}

      {/* Storage stats */}
      {storageStats && (
        <section
          className="mb-8 rounded-xl p-4"
          style={{
            background: "var(--sidebar-bg)",
            border: "1px solid var(--border)",
          }}
        >
          <h2 className="text-lg font-semibold">스토리지 통계</h2>
          <p className="text-sm mt-1 mb-4" style={{ color: "var(--muted)" }}>
            각 서비스의 저장소 사용량 및 연결 상태입니다.
          </p>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <StorageMetricCard
              label="PostgreSQL 데이터베이스 크기"
              value={storageStats.postgres.databaseSize ?? "-"}
              hint={
                storageStats.postgres.connectionCount !== null
                  ? `활성 연결: ${storageStats.postgres.connectionCount}`
                  : undefined
              }
            />
            <StorageMetricCard
              label="Redis 메모리 사용량"
              value={storageStats.redis.usedMemoryHuman ?? "-"}
              hint={
                storageStats.redis.totalKeys !== null
                  ? `총 키: ${storageStats.redis.totalKeys.toLocaleString()}`
                  : undefined
              }
            />
            <StorageMetricCard
              label="MinIO / S3"
              value={storageStats.minio.enabled ? "활성" : "비활성 (로컬 저장소)"}
              hint={
                storageStats.minio.bucket
                  ? `버킷: ${storageStats.minio.bucket}`
                  : undefined
              }
            />
            <StorageMetricCard
              label="Qdrant 벡터"
              value={
                storageStats.qdrant.enabled
                  ? storageStats.qdrant.totalPoints !== null
                    ? `${storageStats.qdrant.totalPoints.toLocaleString()} 포인트`
                    : "정보 없음"
                  : "비활성"
              }
              hint={
                storageStats.qdrant.collectionCount !== null
                  ? `컬렉션: ${storageStats.qdrant.collectionCount}`
                  : undefined
              }
            />
          </div>
        </section>
      )}
    </div>
  );
}
