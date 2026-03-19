export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/helpers";
import { AuditLogViewer } from "@/components/admin/AuditLogViewer";

export default async function AdminAuditLogsPage() {
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

  return <AuditLogViewer />;
}
