"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClientSafeProvider, getProviders, signIn } from "next-auth/react";
import { useEffect, useState } from "react";

interface RegisterPageClientProps {
  allowSelfSignup: boolean;
  samlProviderName: string | null;
}

export function RegisterPageClient({
  allowSelfSignup,
  samlProviderName,
}: RegisterPageClientProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [providersLoaded, setProvidersLoaded] = useState(false);
  const [oidcProvider, setOidcProvider] = useState<ClientSafeProvider | null>(null);

  useEffect(() => {
    async function loadProviders() {
      try {
        const providers = await getProviders();
        setOidcProvider(providers?.oidc || null);
      } finally {
        setProvidersLoaded(true);
      }
    }

    void loadProviders();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "회원가입에 실패했습니다." }));
      if (res.status === 403) {
        setError("셀프 회원가입이 비활성화되어 있습니다.");
      } else {
        setError(data.error || "회원가입에 실패했습니다.");
      }
      setLoading(false);
      return;
    }

    const result = await signIn("credentials", { email, password, redirect: false });
    if (result?.error) {
      setError("계정이 생성되었지만 자동 로그인에 실패했습니다. 로그인 페이지에서 다시 시도해주세요.");
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
    window.location.href = "/api/auth/saml/login?callbackUrl=%2Fworkspace";
  }

  if (!allowSelfSignup) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background: "linear-gradient(135deg, var(--background) 0%, var(--sidebar-bg) 50%, var(--background) 100%)",
        }}
      >
        <div
          className="w-full max-w-sm p-8 rounded-xl"
          style={{ background: "var(--background)", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}
        >
          <h1 className="text-2xl font-bold mb-4 text-center">JPAD</h1>
          <p
            className="text-sm p-3 rounded mb-4"
            style={{ color: "var(--muted)", background: "var(--sidebar-hover)" }}
          >
            이 배포는 셀프 회원가입이 비활성화되어 있습니다.
          </p>
          {oidcProvider && (
            <button
              type="button"
              onClick={handleOidcSignIn}
              disabled={loading}
              className="w-full py-2 rounded-md text-sm font-medium mb-4"
              style={{ border: "1px solid var(--border)", background: "var(--background)" }}
            >
              {oidcProvider.name}로 계속하기
            </button>
          )}
          {samlProviderName && (
            <button
              type="button"
              onClick={handleSamlSignIn}
              disabled={loading}
              className="w-full py-2 rounded-md text-sm font-medium mb-4"
              style={{ border: "1px solid var(--border)", background: "var(--background)" }}
            >
              {samlProviderName}로 계속하기
            </button>
          )}
          {!providersLoaded && (
            <p className="text-xs text-center mb-4" style={{ color: "var(--muted)" }}>
              로그인 수단을 확인하는 중입니다...
            </p>
          )}
          <p className="text-center text-sm" style={{ color: "var(--muted)" }}>
            <Link href="/login" className="underline" style={{ color: "var(--primary)" }}>
              로그인 페이지로 이동
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{
        background: "linear-gradient(135deg, var(--background) 0%, var(--sidebar-bg) 50%, var(--background) 100%)",
      }}
    >
      <div
        className="w-full max-w-sm p-8 rounded-xl"
        style={{ background: "var(--background)", boxShadow: "0 4px 24px rgba(0,0,0,0.08)" }}
      >
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

        {(oidcProvider || samlProviderName) && (
          <>
            {oidcProvider && (
              <button
                type="button"
                onClick={handleOidcSignIn}
                disabled={loading}
                className="w-full py-2 rounded-md text-sm font-medium mb-4"
                style={{ border: "1px solid var(--border)", background: "var(--background)" }}
              >
                {oidcProvider.name}로 계속하기
              </button>
            )}
            {samlProviderName && (
              <button
                type="button"
                onClick={handleSamlSignIn}
                disabled={loading}
                className="w-full py-2 rounded-md text-sm font-medium mb-4"
                style={{ border: "1px solid var(--border)", background: "var(--background)" }}
              >
                {samlProviderName}로 계속하기
              </button>
            )}
            <p className="text-xs text-center mb-4" style={{ color: "var(--muted)" }}>
              또는 이메일과 비밀번호로 계정 생성
            </p>
          </>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" role="form">
          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-1">
              이름
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-md text-sm"
              style={{ border: "1px solid var(--border)", background: "var(--background)" }}
            />
          </div>
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
              minLength={8}
              className="w-full px-3 py-2 rounded-md text-sm"
              style={{ border: "1px solid var(--border)", background: "var(--background)" }}
            />
            <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              8자 이상, 대/소문자, 숫자, 특수문자 포함
            </p>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-md text-white text-sm font-medium"
            style={{ background: "var(--primary)" }}
          >
            {loading ? <><Loader2 size={16} className="inline animate-spin mr-1" />가입 중...</> : "회원가입"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm" style={{ color: "var(--muted)" }}>
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="underline" style={{ color: "var(--primary)" }}>
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
