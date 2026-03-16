"use client";

import { useParams } from "next/navigation";
import CalendarView from "@/components/calendar/CalendarView";

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
