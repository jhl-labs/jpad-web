"use client";

import { useParams } from "next/navigation";
import { ListTodo } from "lucide-react";
import { TodoList } from "@/components/todos/TodoList";

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
