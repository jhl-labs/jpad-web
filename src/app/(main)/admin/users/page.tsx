export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/helpers";
import { UserManagement } from "@/components/admin/UserManagement";

export default async function AdminUsersPage() {
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

  return <UserManagement />;
}
