"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ClientSafeProvider, getProviders, signIn } from "next-auth/react";
import { useEffect, useState } from "react";

interface LoginPageClientProps {
  allowCredentialsLogin: boolean;
  allowSelfSignup: boolean;
  samlProviderName: string | null;
}

function getAuthErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case "CredentialsSignin":
      return "이메일 또는 비밀번호가 올바르지 않습니다.";
    case "AccessDenied":
      return "로그인이 거부되었습니다.";
    case "OIDCLinkRequired":
      return "기존 계정과 SSO 자동 연결이 비활성화되어 있습니다. 관리자에게 문의하세요.";
    case "OIDCEmailRequired":
      return "SSO 계정에서 이메일 정보를 확인할 수 없습니다.";
    case "OIDCEmailNotVerified":
      return "검증된 이메일을 제공하는 SSO 계정만 허용됩니다.";
    case "OIDCEmailConflict":
      return "이 이메일은 다른 계정에 이미 연결되어 있습니다.";
    case "OIDCAccountConflict":
      return "SSO 계정 연결 정보가 기존 사용자와 충돌합니다.";
    case "OIDCSubjectMissing":
      return "SSO 계정 식별자를 확인할 수 없습니다.";
    case "SAMLLinkRequired":
      return "기존 계정과 SAML 자동 연결이 비활성화되어 있습니다. 관리자에게 문의하세요.";
    case "SAMLEmailRequired":
      return "SAML 응답에서 이메일 정보를 확인할 수 없습니다.";
    case "SAMLEmailConflict":
      return "이 이메일은 다른 계정에 이미 연결되어 있습니다.";
    case "SAMLAccountConflict":
      return "SAML 계정 연결 정보가 기존 사용자와 충돌합니다.";
    case "SAMLIssuerMissing":
      return "SAML 발급자 정보를 확인할 수 없습니다.";
    case "SAMLSubjectMissing":
      return "SAML 계정 식별자를 확인할 수 없습니다.";
    case "SAMLProviderDisabled":
      return "SAML 로그인이 구성되어 있지 않습니다.";
    case "SAMLResponseInvalid":
      return "SAML 응답 검증에 실패했습니다.";
    case "SAMLSessionInvalid":
      return "SAML 로그인 세션이 만료되었거나 유효하지 않습니다.";
    default:
      return "로그인에 실패했습니다. 잠시 후 다시 시도하세요.";
  }
}

export function LoginPageClient({
  allowCredentialsLogin,
  allowSelfSignup,
  samlProviderName,
}: LoginPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [oidcProvider, setOidcProvider] = useState<ClientSafeProvider | null>(null);
  const [credentialsEnabled, setCredentialsEnabled] = useState(allowCredentialsLogin);

  useEffect(() => {
    async function loadProviders() {
      try {
        const providers = await getProviders();
        setCredentialsEnabled(Boolean(providers?.credentials));
        setOidcProvider(providers?.oidc || null);
      } finally {
        setProvidersLoaded(true);
      }
    }

    void loadProviders();
  }, []);

  useEffect(() => {
    const errorCode = searchParams.get("error");
    if (!errorCode) return;
    setError(getAuthErrorMessage(errorCode));
  }, [searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError(getAuthErrorMessage(result.error));
      setLoading(false);
      return;
    }

    router.push("/workspace");
  }

  async function handleOidcSignIn() {
    if (!oidcProvider) return;
    setLoading(true);
    await signIn(oidcProvider.id, { callbackUrl: "/workspace" });
  }

  function handleSamlSignIn() {
    setLoading(true);
    const callbackUrl = searchParams.get("callbackUrl") || "/workspace";
    window.location.href = `/api/auth/saml/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--background)" }}
    >
      <div className="w-full max-w-sm p-8">
        <h1 className="text-2xl font-bold mb-6 text-center">JPAD</h1>

        {error && (
          <p
            className="text-sm p-3 rounded mb-4"
            role="alert"
            aria-live="polite"
            style={{ color: "var(--danger)", background: "rgba(239,68,68,0.08)" }}
          >
            {error}
          </p>
        )}

        {oidcProvider && (
          <>
            <button
              type="button"
              onClick={handleOidcSignIn}
              disabled={loading}
              className="w-full py-2 rounded-md text-sm font-medium mb-4"
              style={{ border: "1px solid var(--border)", background: "var(--background)" }}
            >
              {oidcProvider.name}로 계속하기
            </button>
            {credentialsEnabled && (
              <p className="text-xs text-center mb-4" style={{ color: "var(--muted)" }}>
                또는 이메일과 비밀번호로 로그인
              </p>
            )}
          </>
        )}

        {samlProviderName && (
          <>
            <button
              type="button"
              onClick={handleSamlSignIn}
              disabled={loading}
              className="w-full py-2 rounded-md text-sm font-medium mb-4"
              style={{ border: "1px solid var(--border)", background: "var(--background)" }}
            >
              {samlProviderName}로 계속하기
            </button>
            {(oidcProvider || credentialsEnabled) && (
              <p className="text-xs text-center mb-4" style={{ color: "var(--muted)" }}>
                다른 로그인 수단도 사용할 수 있습니다.
              </p>
            )}
          </>
        )}

        {credentialsEnabled ? (
          <form onSubmit={handleSubmit} className="space-y-4" role="form">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1">
                이메일
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-md text-sm"
                style={{ border: "1px solid var(--border)", background: "var(--background)" }}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1">
                비밀번호
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-md text-sm"
                style={{ border: "1px solid var(--border)", background: "var(--background)" }}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 rounded-md text-white text-sm font-medium"
              style={{ background: "var(--primary)" }}
            >
              {loading ? <><Loader2 size={16} className="inline animate-spin mr-1" />로그인 중...</> : "로그인"}
            </button>
          </form>
        ) : providersLoaded ? (
          <div
            className="text-sm p-3 rounded"
            style={{ color: "var(--muted)", background: "var(--sidebar-hover)" }}
          >
            {oidcProvider || samlProviderName
              ? "이 배포는 로컬 이메일/비밀번호 로그인이 비활성화되어 있습니다."
              : "현재 로그인 수단이 구성되어 있지 않습니다."}
          </div>
        ) : (
          <p className="text-sm text-center" style={{ color: "var(--muted)" }}>
            로그인 수단을 확인하는 중입니다...
          </p>
        )}

        {allowSelfSignup ? (
          <p className="mt-4 text-center text-sm" style={{ color: "var(--muted)" }}>
            계정이 없으신가요?{" "}
            <Link href="/register" className="underline" style={{ color: "var(--primary)" }}>
              회원가입
            </Link>
          </p>
        ) : (
          <p className="mt-4 text-center text-sm" style={{ color: "var(--muted)" }}>
            계정 생성은 관리자 또는 SSO 프로비저닝에서 관리됩니다.
          </p>
        )}
      </div>
    </div>
  );
}
