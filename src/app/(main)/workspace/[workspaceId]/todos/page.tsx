"use client";

import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { ListTodo, Loader2 } from "lucide-react";

const TodoList = dynamic(
  () => import("@/components/todos/TodoList").then(m => m.TodoList),
  { loading: () => <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin" size={24} /></div> }
);

export default function TodosPage() {
  const params = useParams();
  const workspaceId = params.workspaceId as string;

  return (
    <div style={{ padding: "2rem", maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "2rem",
        }}
      >
        <ListTodo
          size={28}
          style={{ color: "var(--color-blue-500)" }}
        />
        <h1
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: "var(--color-gray-900)",
            margin: 0,
          }}
        >
          할 일 관리
        </h1>
      </div>

      <TodoList workspaceId={workspaceId} />
    </div>
  );
}
