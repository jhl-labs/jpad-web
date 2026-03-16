export const dynamic = "force-dynamic";

import { getSamlConfig, isSelfSignupEnabled } from "@/lib/auth/config";
import { RegisterPageClient } from "@/components/auth/RegisterPageClient";

export default function RegisterPage() {
  const samlConfig = getSamlConfig();

  return (
    <RegisterPageClient
      allowSelfSignup={isSelfSignupEnabled()}
      samlProviderName={samlConfig?.name || null}
    />
  );
}
