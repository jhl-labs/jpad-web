"use client";

import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const CalendarView = dynamic(
  () => import("@/components/calendar/CalendarView"),
  { loading: () => <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin" size={24} /></div> }
);

export default function CalendarPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;

  return (
    <div
      style={{
        padding: "32px 40px",
        minHeight: "100vh",
        background: "var(--background)",
      }}
    >
      <CalendarView workspaceId={workspaceId} />
    </div>
  );
}
