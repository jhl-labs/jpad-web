"use client";

import { ArrowLeft, BadgeCheck, Building2, Globe, Plus, RefreshCw, Shield } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface OrganizationDomain {
  id: string;
  domain: string;
  autoJoin: boolean;
  verifiedAt: string | null;
  verificationToken: string;
}

interface OrganizationWorkspace {
  id: string;
  name: string;
  slug: string;
  visibility: string;
}

interface OrganizationScimToken {
  id: string;
  label: string;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OrganizationScimGroupMapping {
  id: string;
  role: string;
  workspaceId: string;
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
}

interface OrganizationScimGroup {
  id: string;
  externalId: string | null;
  displayName: string;
  lastProvisionedAt: string;
  _count: {
    members: number;
  };
  workspaceMappings: OrganizationScimGroupMapping[];
}

interface CreatedScimToken {
  id: string;
  label: string;
  token: string;
  createdAt: string;
  scimBaseUrl: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  currentRole: string | null;
  domains: OrganizationDomain[];
  workspaces: OrganizationWorkspace[];
  _count: {
    workspaces: number;
    domains: number;
    members: number;
  };
}

interface VerificationPayload {
  txtRecordName: string;
  txtRecordValue: string;
}

function formatTimestamp(value: string | null) {
  if (!value) return "아직 사용 안 됨";
  return new Date(value).toLocaleString();
}

export function OrganizationsPageClient() {
  const router = useRouter();
  const { status } = useSession();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [domainInputs, setDomainInputs] = useState<Record<string, string>>({});
  const [autoJoinInputs, setAutoJoinInputs] = useState<Record<string, boolean>>({});
  const [verifications, setVerifications] = useState<Record<string, VerificationPayload>>({});
  const [busyDomainIds, setBusyDomainIds] = useState<Record<string, boolean>>({});
  const [scimTokensByOrganization, setScimTokensByOrganization] = useState<
    Record<string, OrganizationScimToken[]>
  >({});
  const [scimBaseUrls, setScimBaseUrls] = useState<Record<string, string>>({});
  const [scimTokenLabels, setScimTokenLabels] = useState<Record<string, string>>({});
  const [busyScimTokenIds, setBusyScimTokenIds] = useState<Record<string, boolean>>({});
  const [createdScimTokens, setCreatedScimTokens] = useState<
    Record<string, CreatedScimToken | null>
  >({});
  const [scimGroupsByOrganization, setScimGroupsByOrganization] = useState<
    Record<string, OrganizationScimGroup[]>
  >({});
  const [organizationWorkspaceOptions, setOrganizationWorkspaceOptions] = useState<
    Record<string, OrganizationWorkspace[]>
  >({});
  const [scimMappingInputs, setScimMappingInputs] = useState<
    Record<string, { scimGroupId: string; workspaceId: string; role: string }>
  >({});
  const [busyScimMappingIds, setBusyScimMappingIds] = useState<Record<string, boolean>>({});

  const fetchScimTokens = useCallback(
    async (organizationId: string) => {
      const res = await fetch(`/api/organizations/${organizationId}/scim-tokens`);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.status === 403) {
        setScimTokensByOrganization((current) => ({ ...current, [organizationId]: [] }));
        return;
      }
      if (!res.ok) {
        throw new Error("SCIM 토큰 목록을 불러오지 못했습니다.");
      }

      const data = (await res.json()) as {
        data: OrganizationScimToken[];
        scimBaseUrl: string;
      };

      setScimTokensByOrganization((current) => ({
        ...current,
        [organizationId]: data.data,
      }));
      setScimBaseUrls((current) => ({
        ...current,
        [organizationId]: data.scimBaseUrl,
      }));
    },
    [router]
  );

  const fetchScimGroups = useCallback(
    async (organizationId: string) => {
      const res = await fetch(`/api/organizations/${organizationId}/scim-groups`);
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.status === 403) {
        setScimGroupsByOrganization((current) => ({ ...current, [organizationId]: [] }));
        setOrganizationWorkspaceOptions((current) => ({
          ...current,
          [organizationId]: [],
        }));
        return;
      }
      if (!res.ok) {
        throw new Error("SCIM 그룹 목록을 불러오지 못했습니다.");
      }

      const data = (await res.json()) as {
        data: OrganizationScimGroup[];
        workspaces: OrganizationWorkspace[];
      };

      setScimGroupsByOrganization((current) => ({
        ...current,
        [organizationId]: data.data,
      }));
      setOrganizationWorkspaceOptions((current) => ({
        ...current,
        [organizationId]: data.workspaces,
      }));
      setScimMappingInputs((current) => ({
        ...current,
        [organizationId]:
          current[organizationId] || {
            scimGroupId: data.data[0]?.id || "",
            workspaceId: data.workspaces[0]?.id || "",
            role: "viewer",
          },
      }));
    },
    [router]
  );

  const fetchOrganizations = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/organizations");
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        throw new Error("조직 목록을 불러오지 못했습니다.");
      }
      const data = (await res.json()) as Organization[];
      setOrganizations(data);

      const manageableOrganizationIds = new Set(
        data
          .filter((organization) => ["owner", "admin"].includes(organization.currentRole || ""))
          .map((organization) => organization.id)
      );
      setScimTokensByOrganization((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([organizationId]) =>
            manageableOrganizationIds.has(organizationId)
          )
        )
      );
      setScimBaseUrls((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([organizationId]) =>
            manageableOrganizationIds.has(organizationId)
          )
        )
      );
      setCreatedScimTokens((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([organizationId]) =>
            manageableOrganizationIds.has(organizationId)
          )
        )
      );
      setScimGroupsByOrganization((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([organizationId]) =>
            manageableOrganizationIds.has(organizationId)
          )
        )
      );
      setOrganizationWorkspaceOptions((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([organizationId]) =>
            manageableOrganizationIds.has(organizationId)
          )
        )
      );
      setScimMappingInputs((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([organizationId]) =>
            manageableOrganizationIds.has(organizationId)
          )
        )
      );

      await Promise.all(
        data
          .filter((organization) => ["owner", "admin"].includes(organization.currentRole || ""))
          .flatMap((organization) => [
            fetchScimTokens(organization.id),
            fetchScimGroups(organization.id),
          ])
      );
    } catch (fetchError) {
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : "조직 목록을 불러오지 못했습니다."
      );
    } finally {
      setLoading(false);
    }
  }, [fetchScimGroups, fetchScimTokens, router]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") {
      void fetchOrganizations();
    }
  }, [fetchOrganizations, router, status]);

  async function handleCreateOrganization(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "조직을 생성하지 못했습니다." }));
        throw new Error(data.error || "조직을 생성하지 못했습니다.");
      }

      setName("");
      setDescription("");
      await fetchOrganizations();
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "조직을 생성하지 못했습니다."
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleAddDomain(organizationId: string) {
    const domain = domainInputs[organizationId]?.trim();
    if (!domain) return;

    setBusyDomainIds((current) => ({ ...current, [organizationId]: true }));
    setError("");
    try {
      const res = await fetch(`/api/organizations/${organizationId}/domains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          autoJoin: Boolean(autoJoinInputs[organizationId]),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "도메인을 추가하지 못했습니다."
        );
      }

      if (data.verification) {
        setVerifications((current) => ({
          ...current,
          [organizationId]: data.verification as VerificationPayload,
        }));
      }
      setDomainInputs((current) => ({ ...current, [organizationId]: "" }));
      await fetchOrganizations();
    } catch (domainError) {
      setError(
        domainError instanceof Error ? domainError.message : "도메인을 추가하지 못했습니다."
      );
    } finally {
      setBusyDomainIds((current) => ({ ...current, [organizationId]: false }));
    }
  }

  async function handleVerifyDomain(organizationId: string, domainId: string) {
    const busyKey = `${organizationId}:${domainId}:verify`;
    setBusyDomainIds((current) => ({ ...current, [busyKey]: true }));
    setError("");
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/domains/${domainId}/verify`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.verification) {
          setVerifications((current) => ({
            ...current,
            [organizationId]: data.verification as VerificationPayload,
          }));
        }
        throw new Error(
          typeof data.error === "string" ? data.error : "도메인을 검증하지 못했습니다."
        );
      }

      await fetchOrganizations();
    } catch (verifyError) {
      setError(
        verifyError instanceof Error ? verifyError.message : "도메인을 검증하지 못했습니다."
      );
    } finally {
      setBusyDomainIds((current) => ({ ...current, [busyKey]: false }));
    }
  }

  async function handleCreateScimToken(organizationId: string) {
    const label = scimTokenLabels[organizationId]?.trim();
    if (!label) return;

    const busyKey = `${organizationId}:create`;
    setBusyScimTokenIds((current) => ({ ...current, [busyKey]: true }));
    setError("");
    try {
      const res = await fetch(`/api/organizations/${organizationId}/scim-tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "SCIM 토큰을 생성하지 못했습니다."
        );
      }

      setCreatedScimTokens((current) => ({
        ...current,
        [organizationId]: data as CreatedScimToken,
      }));
      setScimTokenLabels((current) => ({ ...current, [organizationId]: "" }));
      await fetchScimTokens(organizationId);
    } catch (tokenError) {
      setError(
        tokenError instanceof Error
          ? tokenError.message
          : "SCIM 토큰을 생성하지 못했습니다."
      );
    } finally {
      setBusyScimTokenIds((current) => ({ ...current, [busyKey]: false }));
    }
  }

  async function handleDeleteScimToken(organizationId: string, tokenId: string) {
    const busyKey = `${organizationId}:${tokenId}:delete`;
    setBusyScimTokenIds((current) => ({ ...current, [busyKey]: true }));
    setError("");
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/scim-tokens/${tokenId}`,
        {
          method: "DELETE",
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "SCIM 토큰을 폐기하지 못했습니다."
        );
      }

      await fetchScimTokens(organizationId);
    } catch (tokenError) {
      setError(
        tokenError instanceof Error
          ? tokenError.message
          : "SCIM 토큰을 폐기하지 못했습니다."
      );
    } finally {
      setBusyScimTokenIds((current) => ({ ...current, [busyKey]: false }));
    }
  }

  async function handleCreateScimMapping(organizationId: string) {
    const input = scimMappingInputs[organizationId];
    if (!input?.scimGroupId || !input.workspaceId || !input.role) return;

    const busyKey = `${organizationId}:create`;
    setBusyScimMappingIds((current) => ({ ...current, [busyKey]: true }));
    setError("");
    try {
      const res = await fetch(`/api/organizations/${organizationId}/scim-mappings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "SCIM 그룹 매핑을 생성하지 못했습니다."
        );
      }

      await Promise.all([fetchScimGroups(organizationId), fetchOrganizations()]);
    } catch (mappingError) {
      setError(
        mappingError instanceof Error
          ? mappingError.message
          : "SCIM 그룹 매핑을 생성하지 못했습니다."
      );
    } finally {
      setBusyScimMappingIds((current) => ({ ...current, [busyKey]: false }));
    }
  }

  async function handleDeleteScimMapping(
    organizationId: string,
    mappingId: string
  ) {
    const busyKey = `${organizationId}:${mappingId}:delete`;
    setBusyScimMappingIds((current) => ({ ...current, [busyKey]: true }));
    setError("");
    try {
      const res = await fetch(
        `/api/organizations/${organizationId}/scim-mappings/${mappingId}`,
        {
          method: "DELETE",
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "SCIM 그룹 매핑을 삭제하지 못했습니다."
        );
      }

      await Promise.all([fetchScimGroups(organizationId), fetchOrganizations()]);
    } catch (mappingError) {
      setError(
        mappingError instanceof Error
          ? mappingError.message
          : "SCIM 그룹 매핑을 삭제하지 못했습니다."
      );
    } finally {
      setBusyScimMappingIds((current) => ({ ...current, [busyKey]: false }));
    }
  }

  async function handleDeleteDomain(organizationId: string, domainId: string) {
    const busyKey = `${organizationId}:${domainId}:delete`;
    setBusyDomainIds((current) => ({ ...current, [busyKey]: true }));
    setError("");
    try {
      const res = await fetch(`/api/organizations/${organizationId}/domains/${domainId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "도메인을 삭제하지 못했습니다." }));
        throw new Error(data.error || "도메인을 삭제하지 못했습니다.");
      }

      await fetchOrganizations();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : "도메인을 삭제하지 못했습니다."
      );
    } finally {
      setBusyDomainIds((current) => ({ ...current, [busyKey]: false }));
    }
  }

  if (status === "loading") return null;

  return (
    <div className="min-h-screen max-w-5xl mx-auto p-6 md:p-10">
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
            <h1 className="text-2xl font-bold">조직</h1>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              도메인 검증과 auto-join 정책으로 워크스페이스를 조직 단위로 운영합니다.
            </p>
          </div>
        </div>
        <button
          onClick={() => void fetchOrganizations()}
          className="flex items-center gap-2 px-4 py-2 rounded text-sm text-white"
          style={{ background: "var(--primary)" }}
        >
          <RefreshCw size={14} />
          새로고침
        </button>
      </div>

      {error && (
        <div
          className="mb-6 rounded-lg px-4 py-3 text-sm"
          style={{ background: "rgba(239,68,68,0.1)", color: "rgba(153,27,27,0.9)" }}
        >
          {error}
        </div>
      )}

      <section
        className="rounded-xl p-5 mb-8"
        style={{ border: "1px solid var(--border)", background: "var(--sidebar-bg)" }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Building2 size={18} />
          <h2 className="text-lg font-semibold">조직 생성</h2>
        </div>
        <form onSubmit={handleCreateOrganization} className="grid gap-3 md:grid-cols-[1.2fr_1.8fr_auto]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="조직 이름"
            className="px-3 py-2 rounded-md text-sm"
            style={{ border: "1px solid var(--border)", background: "var(--background)" }}
          />
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="설명 (선택)"
            className="px-3 py-2 rounded-md text-sm"
            style={{ border: "1px solid var(--border)", background: "var(--background)" }}
          />
          <button
            type="submit"
            disabled={creating}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm text-white"
            style={{ background: "var(--primary)" }}
          >
            <Plus size={14} />
            {creating ? "생성 중..." : "조직 생성"}
          </button>
        </form>
      </section>

      <section className="space-y-4">
        {loading ? (
          <div className="rounded-xl p-6 text-sm" style={{ border: "1px solid var(--border)" }}>
            조직을 불러오는 중입니다...
          </div>
        ) : organizations.length === 0 ? (
          <div className="rounded-xl p-8 text-center text-sm" style={{ border: "1px solid var(--border)", color: "var(--muted)" }}>
            아직 조직이 없습니다.
          </div>
        ) : (
          organizations.map((organization) => {
            const canManage = ["owner", "admin"].includes(organization.currentRole || "");
            const verification = verifications[organization.id];
            const scimTokens = scimTokensByOrganization[organization.id] || [];
            const createdScimToken = createdScimTokens[organization.id];
            const scimBaseUrl = scimBaseUrls[organization.id];
            const scimGroups = scimGroupsByOrganization[organization.id] || [];
            const workspaceOptions = organizationWorkspaceOptions[organization.id] || [];
            const scimMappingInput = scimMappingInputs[organization.id] || {
              scimGroupId: scimGroups[0]?.id || "",
              workspaceId: workspaceOptions[0]?.id || "",
              role: "viewer",
            };

            return (
              <article
                key={organization.id}
                className="rounded-xl p-5"
                style={{ border: "1px solid var(--border)", background: "var(--background)" }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-semibold">{organization.name}</h2>
                      <span
                        className="text-xs px-2 py-1 rounded-full"
                        style={{ background: "var(--sidebar-hover)", color: "var(--muted)" }}
                      >
                        {organization.slug}
                      </span>
                      {organization.currentRole && (
                        <span
                          className="text-xs px-2 py-1 rounded-full"
                          style={{ background: "rgba(59,130,246,0.1)", color: "var(--primary)" }}
                        >
                          {organization.currentRole}
                        </span>
                      )}
                    </div>
                    {organization.description && (
                      <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
                        {organization.description}
                      </p>
                    )}
                  </div>
                  <div className="text-xs text-right" style={{ color: "var(--muted)" }}>
                    <div>{organization._count.members}명 멤버</div>
                    <div>{organization._count.workspaces}개 워크스페이스</div>
                    <div>{organization._count.domains}개 도메인</div>
                  </div>
                </div>

                {organization.workspaces.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
                      최근 조직 워크스페이스
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {organization.workspaces.map((workspace) => (
                        <button
                          key={workspace.id}
                          onClick={() => router.push(`/workspace/${workspace.id}`)}
                          className="text-xs px-3 py-1.5 rounded-full"
                          style={{ border: "1px solid var(--border)" }}
                        >
                          {workspace.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Globe size={16} />
                      <h3 className="font-medium">도메인</h3>
                    </div>

                    <div className="space-y-3">
                      {organization.domains.length === 0 ? (
                        <p className="text-sm" style={{ color: "var(--muted)" }}>
                          등록된 도메인이 없습니다.
                        </p>
                      ) : (
                        organization.domains.map((domain) => {
                          const verifyBusy = busyDomainIds[`${organization.id}:${domain.id}:verify`];
                          const deleteBusy = busyDomainIds[`${organization.id}:${domain.id}:delete`];
                          return (
                            <div
                              key={domain.id}
                              className="rounded-lg p-3"
                              style={{ border: "1px solid var(--border)" }}
                            >
                              <div className="flex items-center justify-between gap-3 mb-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium">{domain.domain}</span>
                                  {domain.verifiedAt ? (
                                    <span
                                      className="text-xs px-2 py-1 rounded-full flex items-center gap-1"
                                      style={{ background: "rgba(34,197,94,0.1)", color: "rgba(22,101,52,0.9)" }}
                                    >
                                      <BadgeCheck size={12} />
                                      verified
                                    </span>
                                  ) : (
                                    <span
                                      className="text-xs px-2 py-1 rounded-full flex items-center gap-1"
                                      style={{ background: "rgba(245,158,11,0.1)", color: "rgba(146,64,14,0.9)" }}
                                    >
                                      <Shield size={12} />
                                      pending
                                    </span>
                                  )}
                                  {domain.autoJoin && (
                                    <span
                                      className="text-xs px-2 py-1 rounded-full"
                                      style={{ background: "rgba(59,130,246,0.1)", color: "var(--primary)" }}
                                    >
                                      auto-join
                                    </span>
                                  )}
                                </div>
                                {canManage && (
                                  <div className="flex gap-2">
                                    {!domain.verifiedAt && (
                                      <button
                                        type="button"
                                        onClick={() => void handleVerifyDomain(organization.id, domain.id)}
                                        disabled={verifyBusy}
                                        className="text-xs px-2 py-1 rounded"
                                        style={{ border: "1px solid var(--border)" }}
                                      >
                                        {verifyBusy ? "확인 중..." : "검증"}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => void handleDeleteDomain(organization.id, domain.id)}
                                      disabled={deleteBusy}
                                      className="text-xs px-2 py-1 rounded"
                                      style={{ border: "1px solid var(--border)", color: "rgba(153,27,27,0.9)" }}
                                    >
                                      삭제
                                    </button>
                                  </div>
                                )}
                              </div>
                              {!domain.verifiedAt && (
                                <p className="text-xs" style={{ color: "var(--muted)" }}>
                                  TXT 레코드 `{`_jpad.${domain.domain}`}`에 검증 토큰을 등록한 뒤 검증합니다.
                                </p>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Shield size={16} />
                      <h3 className="font-medium">도메인 관리</h3>
                    </div>

                    {canManage ? (
                      <div
                        className="rounded-lg p-4 space-y-3"
                        style={{ border: "1px solid var(--border)", background: "var(--sidebar-bg)" }}
                      >
                        <input
                          value={domainInputs[organization.id] || ""}
                          onChange={(e) =>
                            setDomainInputs((current) => ({
                              ...current,
                              [organization.id]: e.target.value,
                            }))
                          }
                          placeholder="example.com"
                          className="w-full px-3 py-2 rounded-md text-sm"
                          style={{ border: "1px solid var(--border)", background: "var(--background)" }}
                        />
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={Boolean(autoJoinInputs[organization.id])}
                            onChange={(e) =>
                              setAutoJoinInputs((current) => ({
                                ...current,
                                [organization.id]: e.target.checked,
                              }))
                            }
                          />
                          검증 후 같은 이메일 도메인 사용자를 조직에 auto-join
                        </label>
                        <button
                          type="button"
                          onClick={() => void handleAddDomain(organization.id)}
                          disabled={busyDomainIds[organization.id]}
                          className="w-full px-4 py-2 rounded-md text-sm text-white"
                          style={{ background: "var(--primary)" }}
                        >
                          {busyDomainIds[organization.id] ? "추가 중..." : "도메인 추가"}
                        </button>

                        {verification && (
                          <div
                            className="rounded-lg p-3 text-xs"
                            style={{ background: "rgba(59,130,246,0.1)", color: "var(--primary)" }}
                          >
                            <div>TXT 이름: {verification.txtRecordName}</div>
                            <div className="break-all mt-1">TXT 값: {verification.txtRecordValue}</div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm" style={{ color: "var(--muted)" }}>
                        이 조직의 도메인 정책은 owner/admin만 관리할 수 있습니다.
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 mt-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Shield size={16} />
                      <h3 className="font-medium">SCIM 프로비저닝</h3>
                    </div>

                    {canManage ? (
                      <div className="space-y-3">
                        {scimBaseUrl && (
                          <div
                            className="rounded-lg p-3 text-xs"
                            style={{ border: "1px solid var(--border)", color: "var(--muted)" }}
                          >
                            <div className="font-medium mb-1" style={{ color: "var(--foreground)" }}>
                              Base URL
                            </div>
                            <div className="break-all">{scimBaseUrl}</div>
                          </div>
                        )}

                        {scimTokens.length === 0 ? (
                          <p className="text-sm" style={{ color: "var(--muted)" }}>
                            발급된 SCIM 토큰이 없습니다.
                          </p>
                        ) : (
                          scimTokens.map((token) => {
                            const deleteBusy =
                              busyScimTokenIds[`${organization.id}:${token.id}:delete`];
                            return (
                              <div
                                key={token.id}
                                className="rounded-lg p-3"
                                style={{ border: "1px solid var(--border)" }}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-medium">{token.label}</div>
                                    <div
                                      className="text-xs mt-1"
                                      style={{ color: "var(--muted)" }}
                                    >
                                      생성: {formatTimestamp(token.createdAt)}
                                    </div>
                                    <div
                                      className="text-xs mt-1"
                                      style={{ color: "var(--muted)" }}
                                    >
                                      최근 사용: {formatTimestamp(token.lastUsedAt)}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void handleDeleteScimToken(organization.id, token.id)
                                    }
                                    disabled={deleteBusy}
                                    className="text-xs px-2 py-1 rounded"
                                    style={{
                                      border: "1px solid var(--border)",
                                      color: "rgba(153,27,27,0.9)",
                                    }}
                                  >
                                    {deleteBusy ? "폐기 중..." : "폐기"}
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    ) : (
                      <p className="text-sm" style={{ color: "var(--muted)" }}>
                        SCIM 프로비저닝은 owner/admin만 관리할 수 있습니다.
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Shield size={16} />
                      <h3 className="font-medium">SCIM 토큰 관리</h3>
                    </div>

                    {canManage ? (
                      <div
                        className="rounded-lg p-4 space-y-3"
                        style={{ border: "1px solid var(--border)", background: "var(--sidebar-bg)" }}
                      >
                        <input
                          value={scimTokenLabels[organization.id] || ""}
                          onChange={(e) =>
                            setScimTokenLabels((current) => ({
                              ...current,
                              [organization.id]: e.target.value,
                            }))
                          }
                          placeholder="예: Okta Production"
                          className="w-full px-3 py-2 rounded-md text-sm"
                          style={{ border: "1px solid var(--border)", background: "var(--background)" }}
                        />
                        <button
                          type="button"
                          onClick={() => void handleCreateScimToken(organization.id)}
                          disabled={busyScimTokenIds[`${organization.id}:create`]}
                          className="w-full px-4 py-2 rounded-md text-sm text-white"
                          style={{ background: "var(--primary)" }}
                        >
                          {busyScimTokenIds[`${organization.id}:create`]
                            ? "생성 중..."
                            : "SCIM 토큰 발급"}
                        </button>

                        <p className="text-xs" style={{ color: "var(--muted)" }}>
                          발급된 토큰은 생성 직후 한 번만 표시됩니다. IdP에는 Base URL과
                          Bearer token을 함께 등록하세요.
                        </p>

                        {createdScimToken && (
                          <div
                            className="rounded-lg p-3 text-xs space-y-2"
                            style={{ background: "rgba(59,130,246,0.1)", color: "var(--primary)" }}
                          >
                            <div className="font-medium">
                              새 토큰: {createdScimToken.label}
                            </div>
                            <div>
                              <div>Base URL</div>
                              <div className="break-all mt-1">{createdScimToken.scimBaseUrl}</div>
                            </div>
                            <div>
                              <div>Bearer Token</div>
                              <div className="break-all mt-1">{createdScimToken.token}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm" style={{ color: "var(--muted)" }}>
                        토큰 발급과 폐기는 owner/admin만 가능합니다.
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 mt-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Shield size={16} />
                      <h3 className="font-medium">SCIM 그룹</h3>
                    </div>

                    {canManage ? (
                      <div className="space-y-3">
                        {scimGroups.length === 0 ? (
                          <p className="text-sm" style={{ color: "var(--muted)" }}>
                            아직 프로비저닝된 SCIM 그룹이 없습니다. IdP에서 `/Groups`로
                            push하면 여기에 표시됩니다.
                          </p>
                        ) : (
                          scimGroups.map((group) => (
                            <div
                              key={group.id}
                              className="rounded-lg p-3"
                              style={{ border: "1px solid var(--border)" }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-sm font-medium">{group.displayName}</div>
                                  {group.externalId && (
                                    <div
                                      className="text-xs mt-1"
                                      style={{ color: "var(--muted)" }}
                                    >
                                      externalId: {group.externalId}
                                    </div>
                                  )}
                                  <div
                                    className="text-xs mt-1"
                                    style={{ color: "var(--muted)" }}
                                  >
                                    {group._count.members}명 멤버 · 마지막 sync:{" "}
                                    {formatTimestamp(group.lastProvisionedAt)}
                                  </div>
                                </div>
                              </div>

                              {group.workspaceMappings.length > 0 ? (
                                <div className="mt-3 space-y-2">
                                  {group.workspaceMappings.map((mapping) => {
                                    const deleteBusy =
                                      busyScimMappingIds[
                                        `${organization.id}:${mapping.id}:delete`
                                      ];
                                    return (
                                      <div
                                        key={mapping.id}
                                        className="flex items-center justify-between gap-3 rounded-md px-3 py-2"
                                        style={{ background: "var(--sidebar-bg)" }}
                                      >
                                        <div className="text-sm">
                                          {mapping.workspace.name}
                                          <span
                                            className="ml-2 text-xs px-2 py-1 rounded-full"
                                            style={{
                                              background: "rgba(59,130,246,0.1)",
                                              color: "var(--primary)",
                                            }}
                                          >
                                            {mapping.role}
                                          </span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            void handleDeleteScimMapping(
                                              organization.id,
                                              mapping.id
                                            )
                                          }
                                          disabled={deleteBusy}
                                          className="text-xs px-2 py-1 rounded"
                                          style={{
                                            border: "1px solid var(--border)",
                                            color: "rgba(153,27,27,0.9)",
                                          }}
                                        >
                                          {deleteBusy ? "삭제 중..." : "매핑 해제"}
                                        </button>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p
                                  className="text-xs mt-3"
                                  style={{ color: "var(--muted)" }}
                                >
                                  아직 워크스페이스 매핑이 없습니다.
                                </p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    ) : (
                      <p className="text-sm" style={{ color: "var(--muted)" }}>
                        SCIM 그룹과 워크스페이스 매핑은 owner/admin만 확인할 수 있습니다.
                      </p>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Shield size={16} />
                      <h3 className="font-medium">워크스페이스 매핑</h3>
                    </div>

                    {canManage ? (
                      <div
                        className="rounded-lg p-4 space-y-3"
                        style={{ border: "1px solid var(--border)", background: "var(--sidebar-bg)" }}
                      >
                        <select
                          value={scimMappingInput.scimGroupId}
                          onChange={(e) =>
                            setScimMappingInputs((current) => ({
                              ...current,
                              [organization.id]: {
                                ...scimMappingInput,
                                scimGroupId: e.target.value,
                              },
                            }))
                          }
                          className="w-full px-3 py-2 rounded-md text-sm"
                          style={{ border: "1px solid var(--border)", background: "var(--background)" }}
                        >
                          <option value="">SCIM 그룹 선택</option>
                          {scimGroups.map((group) => (
                            <option key={group.id} value={group.id}>
                              {group.displayName}
                            </option>
                          ))}
                        </select>

                        <select
                          value={scimMappingInput.workspaceId}
                          onChange={(e) =>
                            setScimMappingInputs((current) => ({
                              ...current,
                              [organization.id]: {
                                ...scimMappingInput,
                                workspaceId: e.target.value,
                              },
                            }))
                          }
                          className="w-full px-3 py-2 rounded-md text-sm"
                          style={{ border: "1px solid var(--border)", background: "var(--background)" }}
                        >
                          <option value="">워크스페이스 선택</option>
                          {workspaceOptions.map((workspace) => (
                            <option key={workspace.id} value={workspace.id}>
                              {workspace.name}
                            </option>
                          ))}
                        </select>

                        <select
                          value={scimMappingInput.role}
                          onChange={(e) =>
                            setScimMappingInputs((current) => ({
                              ...current,
                              [organization.id]: {
                                ...scimMappingInput,
                                role: e.target.value,
                              },
                            }))
                          }
                          className="w-full px-3 py-2 rounded-md text-sm"
                          style={{ border: "1px solid var(--border)", background: "var(--background)" }}
                        >
                          <option value="admin">관리자</option>
                          <option value="maintainer">메인테이너</option>
                          <option value="editor">편집자</option>
                          <option value="viewer">뷰어</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => void handleCreateScimMapping(organization.id)}
                          disabled={busyScimMappingIds[`${organization.id}:create`]}
                          className="w-full px-4 py-2 rounded-md text-sm text-white"
                          style={{ background: "var(--primary)" }}
                        >
                          {busyScimMappingIds[`${organization.id}:create`]
                            ? "생성 중..."
                            : "그룹을 워크스페이스에 매핑"}
                        </button>

                        <p className="text-xs" style={{ color: "var(--muted)" }}>
                          SCIM-managed 멤버는 IdP 그룹 변경으로만 추가/삭제됩니다.
                          수동 role 변경이나 제거는 막힙니다.
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm" style={{ color: "var(--muted)" }}>
                        워크스페이스 매핑은 owner/admin만 관리할 수 있습니다.
                      </p>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
