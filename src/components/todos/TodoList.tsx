"use client";

import { useState, useCallback, useEffect, useRef, useMemo, KeyboardEvent } from "react";
import {
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  Calendar,
  AlertTriangle,
  ArrowUpDown,
  Filter,
  Clock,
  User,
  FileText,
  Loader2,
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface TodoUser {
  id: string;
  name: string;
  email: string;
}

interface TodoPage {
  id: string;
  title: string;
  slug: string;
}

interface Todo {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  priority: "low" | "medium" | "high" | "urgent";
  dueDate: string | null;
  completedAt: string | null;
  sortOrder: number;
  assignee: TodoUser | null;
  createdBy: TodoUser;
  page: TodoPage | null;
  createdAt: string;
  updatedAt: string;
}

interface TodoListProps {
  workspaceId: string;
}

const PRIORITY_CONFIG = {
  urgent: { label: "긴급", textColor: "var(--danger, #ef4444)", bgColor: "rgba(239,68,68,0.1)" },
  high: { label: "높음", textColor: "var(--warning, #f97316)", bgColor: "rgba(249,115,22,0.1)" },
  medium: { label: "보통", textColor: "var(--primary)", bgColor: "rgba(59,130,246,0.1)" },
  low: { label: "낮음", textColor: "var(--muted)", bgColor: "var(--sidebar-bg)" },
} as const;

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

interface WorkspaceMember {
  id: string;
  userId: string;
  user: { id: string; name: string; email: string };
}

export function TodoList({ workspaceId }: TodoListProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [newAssigneeId, setNewAssigneeId] = useState<string>("");
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [filterCompleted, setFilterCompleted] = useState<"all" | "active" | "completed">("all");
  const [sortBy, setSortBy] = useState<"priority" | "dueDate" | "created">("created");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchTodos = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterCompleted === "active") params.set("completed", "false");
      if (filterCompleted === "completed") params.set("completed", "true");

      const res = await fetch(
        `/api/workspaces/${workspaceId}/todos?${params.toString()}`
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setTodos(data.todos || []);
    } catch (e) {
      console.error("Failed to fetch todos:", e);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, filterCompleted]);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`);
      if (!res.ok) return;
      const data = await res.json();
      setMembers(data.members || []);
    } catch (e) {
      console.error("Failed to fetch members:", e);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchTodos();
    fetchMembers();
  }, [fetchTodos, fetchMembers]);

  const addTodo = async () => {
    const title = newTitle.trim();
    if (!title || submitting) return;

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { title, priority: newPriority };
      if (newAssigneeId) body.assigneeId = newAssigneeId;
      const res = await fetch(`/api/workspaces/${workspaceId}/todos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to create");
      const todo = await res.json();
      setTodos((prev) => [todo, ...prev]);
      setNewTitle("");
      setNewPriority("medium");
      setNewAssigneeId("");
      inputRef.current?.focus();
    } catch (e) {
      console.error("Failed to create todo:", e);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleTodo = async (todo: Todo) => {
    const newCompleted = !todo.completed;
    setTodos((prev) =>
      prev.map((t) =>
        t.id === todo.id
          ? { ...t, completed: newCompleted, completedAt: newCompleted ? new Date().toISOString() : null }
          : t
      )
    );

    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/todos/${todo.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ completed: newCompleted }),
        }
      );
      if (!res.ok) throw new Error("Failed to update");
      const updated = await res.json();
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (e) {
      console.error("Failed to toggle todo:", e);
      setTodos((prev) =>
        prev.map((t) => (t.id === todo.id ? todo : t))
      );
    }
  };

  const updateTodo = async (todoId: string, updates: Partial<Pick<Todo, "title" | "dueDate">> & { assigneeId?: string | null }) => {
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/todos/${todoId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        }
      );
      if (!res.ok) throw new Error("Failed to update");
      const updated = await res.json();
      setTodos((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (e) {
      console.error("Failed to update todo:", e);
    }
  };

  const deleteTodo = async (todoId: string) => {
    if (!confirm("이 할 일을 삭제하시겠습니까?")) return;
    setTodos((prev) => prev.filter((t) => t.id !== todoId));

    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/todos/${todoId}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Failed to delete");
    } catch (e) {
      console.error("Failed to delete todo:", e);
      fetchTodos();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      addTodo();
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortedTodos.findIndex((t) => t.id === active.id);
    const newIndex = sortedTodos.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Optimistic reorder
    const reordered = [...sortedTodos];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    // Update sortOrder for all items
    const updated = reordered.map((t, i) => ({ ...t, sortOrder: i }));
    setTodos(updated);

    // Persist the moved item's new sortOrder
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/todos/${String(active.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: newIndex }),
        }
      );
      if (!res.ok) throw new Error("Failed to update sort order");
    } catch (e) {
      console.error("Failed to update sort order:", e);
      fetchTodos();
    }
  };

  const isOverdue = (dueDate: string | null) => {
    if (!dueDate) return false;
    return new Date(dueDate) < new Date() && new Date(dueDate).toDateString() !== new Date().toDateString();
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return "오늘";
    if (days === 1) return "내일";
    if (days === -1) return "어제";
    if (days < -1) return `${Math.abs(days)}일 전`;
    if (days <= 7) return `${days}일 후`;
    return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  };

  const sortedTodos = useMemo(() => [...todos].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;

    if (sortBy === "priority") {
      return (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2);
    }
    if (sortBy === "dueDate") {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }), [todos, sortBy]);

  const totalCount = todos.length;
  const completedCount = todos.filter((t) => t.completed).length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--muted)" }} />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: "0 auto" }}>
      {/* Stats */}
      <div className="flex gap-3 mb-5 flex-wrap">
        {[
          { label: "전체", value: totalCount },
          { label: "완료", value: completedCount },
          ...(totalCount > 0 ? [{ label: "진행률", value: `${progressPct}%` }] : []),
        ].map((stat) => (
          <div
            key={stat.label}
            className="px-3.5 py-2 rounded-lg text-sm"
            style={{
              background: "var(--sidebar-bg)",
              border: "1px solid var(--border)",
              color: "var(--foreground)",
            }}
          >
            <span style={{ color: "var(--muted)" }}>{stat.label}</span>{" "}
            <strong>{stat.value}</strong>
            {typeof stat.value === "number" && <span style={{ color: "var(--muted)" }}>개</span>}
          </div>
        ))}

        {/* Progress bar */}
        {totalCount > 0 && (
          <div className="flex-1 flex items-center min-w-[120px]">
            <div
              className="w-full h-1.5 rounded-full overflow-hidden"
              style={{ background: "var(--sidebar-bg)" }}
            >
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${progressPct}%`,
                  background: progressPct === 100 ? "var(--success, #22c55e)" : "var(--primary)",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Add Todo */}
      <div className="flex gap-2 mb-4 items-center">
        <div
          className="flex-1 flex items-center gap-2 rounded-lg px-3 py-2"
          style={{
            background: "var(--sidebar-bg)",
            border: "1px solid var(--border)",
          }}
        >
          <Plus size={16} className="shrink-0" style={{ color: "var(--muted)" }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="새 할 일 추가... (Enter로 추가)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={submitting}
            className="flex-1 text-sm bg-transparent outline-none"
            style={{ color: "var(--foreground)" }}
          />
          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value as typeof newPriority)}
            className="text-xs rounded px-2 py-1 cursor-pointer outline-none"
            style={{
              background: "var(--background)",
              border: "1px solid var(--border)",
              color: PRIORITY_CONFIG[newPriority].textColor,
            }}
          >
            <option value="low">낮음</option>
            <option value="medium">보통</option>
            <option value="high">높음</option>
            <option value="urgent">긴급</option>
          </select>
          {members.length > 0 && (
            <select
              value={newAssigneeId}
              onChange={(e) => setNewAssigneeId(e.target.value)}
              className="text-xs rounded px-2 py-1 cursor-pointer outline-none"
              style={{
                background: "var(--background)",
                border: "1px solid var(--border)",
                color: newAssigneeId ? "var(--foreground)" : "var(--muted)",
              }}
            >
              <option value="">담당자 없음</option>
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name || m.user.email}
                </option>
              ))}
            </select>
          )}
        </div>
        <button
          onClick={addTodo}
          disabled={!newTitle.trim() || submitting}
          className="px-3.5 py-2 rounded-lg text-sm font-medium transition-opacity disabled:opacity-40"
          style={{
            background: "var(--primary)",
            color: "white",
          }}
        >
          추가
        </button>
      </div>

      {/* Filters & Sort */}
      <div className="flex gap-1.5 mb-4 items-center flex-wrap">
        <Filter size={13} style={{ color: "var(--muted)" }} />
        {(["all", "active", "completed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilterCompleted(f)}
            className="px-2.5 py-1 rounded-full text-xs transition-colors"
            style={{
              background: filterCompleted === f ? "var(--primary)" : "transparent",
              color: filterCompleted === f ? "white" : "var(--muted)",
              border: `1px solid ${filterCompleted === f ? "var(--primary)" : "var(--border)"}`,
            }}
          >
            {f === "all" ? "전체" : f === "active" ? "진행중" : "완료"}
          </button>
        ))}

        <div className="flex-1" />

        <ArrowUpDown size={13} style={{ color: "var(--muted)" }} />
        {(["created", "priority", "dueDate"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSortBy(s)}
            className="px-2.5 py-1 rounded-full text-xs transition-colors"
            style={{
              background: sortBy === s ? "var(--primary)" : "transparent",
              color: sortBy === s ? "white" : "var(--muted)",
              border: `1px solid ${sortBy === s ? "var(--primary)" : "var(--border)"}`,
            }}
          >
            {s === "created" ? "최신순" : s === "priority" ? "우선순위" : "마감일"}
          </button>
        ))}
      </div>

      {/* Todo List */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={sortedTodos.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-1" role="list">
            {sortedTodos.length === 0 && (
              <div
                className="text-center py-12 text-sm"
                style={{ color: "var(--muted)" }}
              >
                {filterCompleted === "completed"
                  ? "완료된 할 일이 없습니다"
                  : filterCompleted === "active"
                    ? "진행중인 할 일이 없습니다"
                    : "할 일이 없습니다. 위 입력란에서 새 할 일을 추가해보세요."}
              </div>
            )}

            {sortedTodos.map((todo) => (
              <SortableTodoItem
                key={todo.id}
                todo={todo}
                members={members}
                onToggle={() => toggleTodo(todo)}
                onDelete={() => deleteTodo(todo.id)}
                onUpdate={(updates) => updateTodo(todo.id, updates)}
                isOverdue={isOverdue(todo.dueDate)}
                formatDate={formatDate}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableTodoItem(props: {
  todo: Todo;
  members: WorkspaceMember[];
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (updates: Partial<Pick<Todo, "title" | "dueDate">> & { assigneeId?: string | null }) => void;
  isOverdue: boolean;
  formatDate: (d: string) => string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.todo.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <TodoItem {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function TodoItem({
  todo,
  members,
  onToggle,
  onDelete,
  onUpdate,
  isOverdue: overdue,
  formatDate,
  dragHandleProps,
}: {
  todo: Todo;
  members: WorkspaceMember[];
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (updates: Partial<Pick<Todo, "title" | "dueDate">> & { assigneeId?: string | null }) => void;
  isOverdue: boolean;
  formatDate: (d: string) => string;
  dragHandleProps?: Record<string, unknown>;
}) {
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(todo.title);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const config = PRIORITY_CONFIG[todo.priority];

  useEffect(() => {
    if (editing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editing]);

  function handleSaveTitle() {
    const trimmed = editTitle.trim();
    setEditing(false);
    if (trimmed && trimmed !== todo.title) {
      onUpdate({ title: trimmed });
    } else {
      setEditTitle(todo.title);
    }
  }

  function handleTitleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSaveTitle();
    }
    if (e.key === "Escape") {
      setEditTitle(todo.title);
      setEditing(false);
    }
  }

  function handleDateChange(dateStr: string) {
    setShowDatePicker(false);
    const isoDate = dateStr ? new Date(dateStr + "T00:00:00Z").toISOString() : null;
    onUpdate({ dueDate: isoDate });
  }

  return (
    <div
      role="listitem"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors"
      style={{
        border: `1px solid ${overdue && !todo.completed ? "rgba(239,68,68,0.3)" : "var(--border)"}`,
        background: overdue && !todo.completed
          ? "rgba(239,68,68,0.05)"
          : hovered
            ? "var(--sidebar-hover)"
            : "transparent",
        opacity: todo.completed ? 0.55 : 1,
      }}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="border-none bg-transparent cursor-grab p-0 mt-0.5 shrink-0 touch-none"
        style={{ color: "var(--muted)" }}
        aria-label="드래그하여 순서 변경"
        {...dragHandleProps}
      >
        <GripVertical size={16} />
      </button>

      {/* Checkbox */}
      <button
        role="checkbox"
        aria-checked={todo.completed}
        onClick={onToggle}
        className="border-none bg-transparent cursor-pointer p-0 mt-0.5 shrink-0 transition-colors"
        style={{
          color: todo.completed ? "var(--success, #22c55e)" : "var(--muted)",
        }}
      >
        {todo.completed ? <CheckCircle2 size={18} /> : <Circle size={18} />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={editInputRef}
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={handleTitleKeyDown}
            onBlur={handleSaveTitle}
            className="w-full text-sm font-medium bg-transparent outline-none px-1 py-0.5 rounded"
            style={{
              color: "var(--foreground)",
              border: "1px solid var(--primary)",
            }}
          />
        ) : (
          <div
            className="text-sm font-medium leading-snug cursor-text"
            style={{
              color: todo.completed ? "var(--muted)" : "var(--foreground)",
              textDecoration: todo.completed ? "line-through" : "none",
            }}
            onClick={() => {
              if (!todo.completed) {
                setEditTitle(todo.title);
                setEditing(true);
              }
            }}
          >
            {todo.title}
          </div>
        )}

        {/* Meta */}
        <div className="flex gap-2 mt-1 flex-wrap items-center">
          {/* Priority badge */}
          <span
            className="inline-flex items-center gap-1 px-2 py-px rounded-full text-[11px] font-medium"
            style={{
              color: config.textColor,
              background: config.bgColor,
            }}
          >
            {todo.priority === "urgent" && <AlertTriangle size={9} />}
            {config.label}
          </span>

          {/* Due date */}
          {todo.dueDate && (
            <span
              className="inline-flex items-center gap-1 text-[11px]"
              style={{
                color: overdue && !todo.completed ? "var(--danger, #ef4444)" : "var(--muted)",
                fontWeight: overdue && !todo.completed ? 600 : 400,
              }}
            >
              {overdue && !todo.completed ? <Clock size={9} /> : <Calendar size={9} />}
              {formatDate(todo.dueDate)}
            </span>
          )}

          {/* Due date picker toggle */}
          {!todo.completed && (
            <span className="relative inline-flex items-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDatePicker(!showDatePicker);
                }}
                className="inline-flex items-center gap-0.5 text-[11px] border-none bg-transparent cursor-pointer p-0 transition-opacity hover:opacity-70"
                style={{ color: "var(--muted)" }}
                title="마감일 설정"
              >
                <Calendar size={10} />
                {!todo.dueDate && <span>마감일</span>}
              </button>
              {showDatePicker && (
                <input
                  type="date"
                  defaultValue={todo.dueDate ? todo.dueDate.slice(0, 10) : ""}
                  onChange={(e) => handleDateChange(e.target.value)}
                  onBlur={() => setShowDatePicker(false)}
                  autoFocus
                  className="absolute left-0 top-5 z-10 text-xs rounded px-1 py-0.5"
                  style={{
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                  }}
                />
              )}
            </span>
          )}

          {/* Assignee */}
          {!todo.completed && members.length > 0 && (
            <span className="relative inline-flex items-center">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAssigneePicker(!showAssigneePicker);
                }}
                className="inline-flex items-center gap-0.5 text-[11px] border-none bg-transparent cursor-pointer p-0 transition-opacity hover:opacity-70"
                style={{ color: "var(--muted)" }}
                title="담당자 변경"
              >
                <User size={10} />
                {todo.assignee ? todo.assignee.name : "담당자"}
              </button>
              {showAssigneePicker && (
                <select
                  value={todo.assignee?.id || ""}
                  onChange={(e) => {
                    setShowAssigneePicker(false);
                    onUpdate({ assigneeId: e.target.value || null });
                  }}
                  onBlur={() => setShowAssigneePicker(false)}
                  autoFocus
                  className="absolute left-0 top-5 z-10 text-xs rounded px-1 py-0.5"
                  style={{
                    background: "var(--background)",
                    border: "1px solid var(--border)",
                    color: "var(--foreground)",
                  }}
                >
                  <option value="">담당자 없음</option>
                  {members.map((m) => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.name || m.user.email}
                    </option>
                  ))}
                </select>
              )}
            </span>
          )}
          {todo.completed && todo.assignee && (
            <span
              className="inline-flex items-center gap-1 text-[11px]"
              style={{ color: "var(--muted)" }}
            >
              <User size={9} />
              {todo.assignee.name}
            </span>
          )}

          {/* Linked page */}
          {todo.page && (
            <span
              className="inline-flex items-center gap-1 text-[11px]"
              style={{ color: "var(--muted)" }}
            >
              <FileText size={9} />
              {todo.page.title}
            </span>
          )}
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="border-none bg-transparent cursor-pointer p-1 rounded shrink-0 transition-opacity"
        style={{
          color: "var(--danger, #ef4444)",
          opacity: hovered ? 0.7 : 0,
        }}
        title="삭제"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
