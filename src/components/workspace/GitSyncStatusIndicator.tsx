"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  GitBranch,
} from "lucide-react";

interface Props {
  workspaceId: string;
}

type SyncState = "idle" | "syncing" | "success" | "error";

export function GitSyncStatusIndicator({ workspaceId }: Props) {
  const [state, setState] = useState<SyncState>("idle");
  const [enabled, setEnabled] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/git-sync/logs?limit=1`);
      if (!res.ok) return;

      const data = await res.json();
      if (data.logs.length === 0) {
        setState("idle");
        return;
      }

      const latest = data.logs[0];
      if (latest.status === "running") {
        setState("syncing");
      } else if (latest.status === "success") {
        setState("success");
      } else if (latest.status === "error") {
        setState("error");
      }
    } catch (err) {
      console.warn("[GitSyncStatus] fetch failed:", err);
    }
  }, [workspaceId]);

  const checkEnabled = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/git-sync`);
      if (!res.ok) return;

      const data = await res.json();
      setEnabled(data.gitSyncEnabled && !!data.gitRemoteUrl);
    } catch (err) {
      console.warn("[GitSyncStatus] fetch failed:", err);
    }
  }, [workspaceId]);

  useEffect(() => {
    checkEnabled();
    checkStatus();

    // Poll every 30 seconds
    const interval = setInterval(() => {
      checkStatus();
    }, 30_000);

    return () => clearInterval(interval);
  }, [checkEnabled, checkStatus]);

  if (!enabled) return null;

  const getIcon = () => {
    switch (state) {
      case "syncing":
        return <Loader2 className="animate-spin" size={14} />;
      case "success":
        return <CheckCircle2 size={14} />;
      case "error":
        return <AlertTriangle size={14} />;
      default:
        return <GitBranch size={14} />;
    }
  };

  const getColor = () => {
    switch (state) {
      case "syncing":
        return "var(--muted)";
      case "success":
        return "#22c55e";
      case "error":
        return "#ef4444";
      default:
        return "var(--muted)";
    }
  };

  const getLabel = () => {
    switch (state) {
      case "syncing":
        return "동기화 중...";
      case "success":
        return "동기화 완료";
      case "error":
        return "동기화 오류";
      default:
        return "Git 연결됨";
    }
  };

  return (
    <div
      className="flex items-center gap-1.5 text-xs px-2 py-1 rounded"
      style={{ color: getColor() }}
      title={getLabel()}
    >
      {getIcon()}
      <span>{getLabel()}</span>
    </div>
  );
}
