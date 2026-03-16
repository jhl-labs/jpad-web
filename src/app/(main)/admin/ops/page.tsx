import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/helpers";
import { OpsDashboard } from "@/components/admin/OpsDashboard";

export default async function AdminOpsPage() {
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

  return <OpsDashboard />;
}
