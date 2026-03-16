"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function SamlLoadingLayout({ message }: { message: string }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--background)" }}
    >
      <div className="w-full max-w-sm p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">JPAD</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {message}
        </p>
      </div>
    </div>
  );
}

function SamlCompleteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    async function finishSamlLogin() {
      const token = searchParams.get("token");
      const rawCallback = searchParams.get("callbackUrl");

      // Open redirect 방지: 동일 origin 상대 경로만 허용
      let callbackUrl = "/workspace";
      if (rawCallback && rawCallback.startsWith("/")) {
        try {
          const url = new URL(rawCallback, window.location.origin);
          if (url.origin === window.location.origin) {
            callbackUrl = url.pathname + url.search + url.hash;
          }
        } catch (_error) {
          // invalid URL, fallback to default /workspace
        }
      }

      if (!token) {
        router.replace("/login?error=SAMLSessionInvalid");
        return;
      }

      try {
        const result = await signIn("saml", {
          token,
          callbackUrl,
          redirect: false,
        });

        if (result?.error) {
          router.replace(`/login?error=${encodeURIComponent(result.error)}`);
          return;
        }

        router.replace(callbackUrl);
      } catch (err) {
        console.error("Failed to complete SAML login session:", err);
        setError("SAML 로그인 세션을 마무리하지 못했습니다.");
      }
    }

    finishSamlLogin();
  }, [router, searchParams]);

  return (
    <SamlLoadingLayout
      message={error || "SAML 로그인을 마무리하는 중입니다..."}
    />
  );
}

export default function SamlCompletePage() {
  return (
    <Suspense fallback={<SamlLoadingLayout message="로딩 중..." />}>
      <SamlCompleteInner />
    </Suspense>
  );
}
