"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Building2, Globe, Lock, Plus, ShieldCheck } from "lucide-react";
import { AppLogo } from "@/components/ui/AppLogo";

interface Workspace {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: string;
  organization?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  _count: { pages: number };
  members: { role: string; userId: string }[];
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  currentRole: string | null;
}

export default function WorkspaceListPage() {
  const { status } = useSession();
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [creating, setCreating] = useState(false);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [canAccessOps, setCanAccessOps] = useState(false);
  const [createError, setCreateError] = useState("");

  const fetchWorkspaces = useCallback(async () => {
    const res = await fetch("/api/workspaces");
    if (res.ok) setWorkspaces(await res.json());
  }, []);

  const fetchOrganizations = useCallback(async () => {
    const res = await fetch("/api/organizations");
    if (res.ok) setOrganizations(await res.json());
  }, []);

  const fetchOpsAccess = useCallback(async () => {
    const res = await fetch("/api/admin/ops/overview");
    setCanAccessOps(res.ok);
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated") {
      fetchWorkspaces();
      fetchOrganizations();
      fetchOpsAccess();
    }
  }, [fetchOpsAccess, fetchOrganizations, fetchWorkspaces, status, router]);

  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || submittingCreate) return;

    setSubmittingCreate(true);
    setCreateError("");

    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          organizationId: selectedOrganizationId || undefined,
        }),
      });

      if (res.ok) {
        const ws = await res.json();
        router.push(`/workspace/${ws.id}`);
        return;
      }

      const payload = (await res.json().catch(() => null)) as
        | { error?: string }
        | null;
      setCreateError(payload?.error || "워크스페이스를 생성하지 못했습니다.");
    } catch (error) {
      setCreateError("워크스페이스 생성 요청 중 네트워크 오류가 발생했습니다.");
    } finally {
      setSubmittingCreate(false);
    }
  }

  if (status === "loading")
    return (
      <div className="min-h-screen p-8 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div className="h-8 w-48 rounded" style={{ background: "var(--sidebar-hover)" }} />
          <div className="h-9 w-36 rounded" style={{ background: "var(--sidebar-hover)" }} />
        </div>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="p-4 rounded-lg animate-pulse"
              style={{ border: "1px solid var(--border)" }}
            >
              <div className="h-5 w-40 rounded mb-2" style={{ background: "var(--sidebar-hover)" }} />
              <div className="h-3 w-24 rounded" style={{ background: "var(--sidebar-hover)" }} />
            </div>
          ))}
        </div>
      </div>
    );

  return (
    <div className="min-h-screen p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <AppLogo />
          <h1 className="text-2xl font-bold">워크스페이스</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/organizations")}
            className="flex items-center gap-1 px-3 py-2 rounded-md text-sm"
            style={{ border: "1px solid var(--border)" }}
          >
            <Building2 size={16} /> 조직
          </button>
          {canAccessOps && (
            <button
              onClick={() => router.push("/admin/ops")}
              className="flex items-center gap-1 px-3 py-2 rounded-md text-sm"
              style={{ border: "1px solid var(--border)" }}
            >
              <ShieldCheck size={16} /> 운영
            </button>
          )}
          <button
            onClick={() => {
              setCreating(true);
              setCreateError("");
            }}
            className="flex items-center gap-1 px-3 py-2 rounded-md text-white text-sm"
            style={{ background: "var(--primary)" }}
          >
            <Plus size={16} /> 새 워크스페이스
          </button>
        </div>
      </div>

      {creating && (
        <div className="mb-6 space-y-2">
          <form onSubmit={createWorkspace} className="flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="워크스페이스 이름"
              className="flex-1 px-3 py-2 rounded-md text-sm"
              style={{ border: "1px solid var(--border)" }}
            />
            <select
              value={selectedOrganizationId}
              onChange={(e) => setSelectedOrganizationId(e.target.value)}
              className="px-3 py-2 rounded-md text-sm"
              style={{ border: "1px solid var(--border)", background: "var(--background)" }}
            >
              <option value="">개인 워크스페이스</option>
              {organizations
                .filter((organization) =>
                  ["owner", "admin"].includes(organization.currentRole || "")
                )
                .map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    조직: {organization.name}
                  </option>
                ))}
            </select>
            <button
              type="submit"
              disabled={submittingCreate}
              className="px-4 py-2 rounded-md text-white text-sm"
              style={{ background: "var(--primary)", opacity: submittingCreate ? 0.7 : 1 }}
            >
              {submittingCreate ? "생성 중..." : "생성"}
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setSubmittingCreate(false);
                setNewName("");
                setSelectedOrganizationId("");
                setCreateError("");
              }}
              className="px-4 py-2 rounded-md text-sm"
              style={{ border: "1px solid var(--border)" }}
            >
              취소
            </button>
          </form>
          {createError && (
            <p
              className="rounded-md px-3 py-2 text-sm"
              style={{ color: "var(--danger)", background: "rgba(239,68,68,0.08)" }}
            >
              {createError}
            </p>
          )}
        </div>
      )}

      <div className="space-y-2">
        {workspaces.map((ws) => (
          <button
            key={ws.id}
            onClick={() => router.push(`/workspace/${ws.id}`)}
            className="w-full text-left p-4 rounded-lg transition-colors"
            style={{ border: "1px solid var(--border)" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sidebar-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">{ws.name}</span>
              {ws.organization && (
                <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--sidebar-bg)", color: "var(--foreground)" }}>
                  <Building2 size={10} /> {ws.organization.name}
                </span>
              )}
              {ws.visibility === "public" ? (
                <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(59,130,246,0.1)", color: "var(--primary)" }}>
                  <Globe size={10} /> Public
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--sidebar-hover)", color: "var(--muted)" }}>
                  <Lock size={10} /> Private
                </span>
              )}
            </div>
            {ws.description && (
              <div className="text-xs mt-1 truncate" style={{ color: "var(--muted)" }}>
                {ws.description}
              </div>
            )}
            <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              {ws._count.pages}개 페이지 · {ws.members?.length || 0}명 멤버
            </div>
          </button>
        ))}
        {workspaces.length === 0 && !creating && (
          <p className="text-center py-12" style={{ color: "var(--muted)" }}>
            워크스페이스가 없습니다. 새로 만들어 보세요.
          </p>
        )}
      </div>
    </div>
  );
}
