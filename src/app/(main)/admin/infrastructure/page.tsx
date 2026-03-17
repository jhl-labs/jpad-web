export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/helpers";
import { InfrastructureDashboard } from "@/components/admin/InfrastructureDashboard";

export default async function AdminInfrastructurePage() {
  try {
    await requirePlatformAdmin();
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "Unauthorized") {
        redirect("/login");
      }
      if (error.message === "Forbidden") {
        redirect("/workspace");
      }
    }
    throw error;
  }

  return <InfrastructureDashboard />;
}
