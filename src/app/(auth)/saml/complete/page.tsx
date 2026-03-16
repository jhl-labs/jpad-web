"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function SamlCompleteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    async function finishSamlLogin() {
      const token = searchParams.get("token");
      const callbackUrl = searchParams.get("callbackUrl") || "/workspace";

      if (!token) {
        router.replace("/login?error=SAMLSessionInvalid");
        return;
      }

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
    }

    void finishSamlLogin().catch(() => {
      setError("SAML 로그인 세션을 마무리하지 못했습니다.");
    });
  }, [router, searchParams]);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--background)" }}
    >
      <div className="w-full max-w-sm p-8 text-center">
        <h1 className="text-2xl font-bold mb-4">JPAD</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {error || "SAML 로그인을 마무리하는 중입니다..."}
        </p>
      </div>
    </div>
  );
}

export default function SamlCompletePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p>로딩 중...</p></div>}>
      <SamlCompleteInner />
    </Suspense>
  );
}
