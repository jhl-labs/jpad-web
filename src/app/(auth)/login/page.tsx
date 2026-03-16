import {
  getSamlConfig,
  isCredentialsLoginEnabled,
  isSelfSignupEnabled,
} from "@/lib/auth/config";
import { LoginPageClient } from "@/components/auth/LoginPageClient";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const samlConfig = getSamlConfig();

  return (
    <LoginPageClient
      allowCredentialsLogin={isCredentialsLoginEnabled()}
      allowSelfSignup={isSelfSignupEnabled()}
      samlProviderName={samlConfig?.name || null}
    />
  );
}
