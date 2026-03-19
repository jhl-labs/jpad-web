"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Link2,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Repeat,
  Trash2,
  Unlink,
  X,
} from "lucide-react";

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  color: string | null;
  location: string | null;
  recurrence: string | null;
  pageId: string | null;
  createdBy: { id: string; name: string; email: string };
  page: { id: string; title: string; slug: string } | null;
}

interface CalendarViewProps {
  workspaceId: string;
}

const WEEKDAYS_FULL = ["일", "월", "화", "수", "목", "금", "토"];
const WEEKDAYS = WEEKDAYS_FULL;

const COLOR_OPTIONS = [
  "#3b82f6",
  "#ef4444",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#f97316",
];

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDateTimeLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}

const RECURRENCE_LABELS: Record<string, string> = {
  daily: "매일",
  weekly: "매주",
  monthly: "매월",
};

export default function CalendarView({ workspaceId }: CalendarViewProps) {
  const today = new Date();
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [, setSelectedDate] = useState<string | null>(null);
  const [quickAddDate, setQuickAddDate] = useState<string | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const quickAddInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formStartAt, setFormStartAt] = useState("");
  const [formEndAt, setFormEndAt] = useState("");
  const [formAllDay, setFormAllDay] = useState(false);
  const [formColor, setFormColor] = useState("#3b82f6");
  const [formLocation, setFormLocation] = useState("");
  const [formRecurrence, setFormRecurrence] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Google Calendar 연동 상태
  const [googleConnected, setGoogleConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [syncResult, setSyncResult] = useState<{ created: number; updated: number } | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const start = new Date(currentYear, currentMonth, 1);
      const end = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59);
      const res = await fetch(
        `/api/workspaces/${workspaceId}/calendar?start=${start.toISOString()}&end=${end.toISOString()}`
      );
      if (res.ok) {
        setEvents(await res.json());
      } else {
        setErrorMessage("일정을 불러오는 데 실패했습니다.");
      }
    } catch (error) {
      setErrorMessage("네트워크 오류로 일정을 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, currentYear, currentMonth]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Google Calendar 연결 상태 확인
  useEffect(() => {
    fetch(`/api/workspaces/${workspaceId}/google-calendar`)
      .then((res) => res.json())
      .then((data) => {
        setGoogleConnected(data.connected);
        setLastSyncAt(data.lastSyncAt);
      })
      .catch(() => {
        // ignore
      });
  }, [workspaceId]);

  // 동기화 결과 자동 숨김
  useEffect(() => {
    if (syncResult) {
      const timer = setTimeout(() => setSyncResult(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [syncResult]);

  // 성공 토스트 자동 숨김
  useEffect(() => {
    if (successToast) {
      const timer = setTimeout(() => setSuccessToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successToast]);

  function handleGoogleConnect() {
    window.location.href = `/api/workspaces/${workspaceId}/google-calendar/connect`;
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/google-calendar/sync`,
        { method: "POST" }
      );
      const data = await res.json();
      setSyncResult(data);
      setLastSyncAt(new Date().toISOString());
      fetchEvents();
    } catch (_error) {
      // ignore
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    try {
      await fetch(`/api/workspaces/${workspaceId}/google-calendar`, {
        method: "DELETE",
      });
      setGoogleConnected(false);
      setLastSyncAt(null);
      setSyncResult(null);
    } catch (_error) {
      // ignore
    }
  }

  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const event of events) {
      const start = new Date(event.startAt);
      const end = event.endAt ? new Date(event.endAt) : start;
      const current = new Date(start);
      current.setHours(0, 0, 0, 0);
      const endDay = new Date(end);
      endDay.setHours(0, 0, 0, 0);
      while (current <= endDay) {
        const dateStr = current.toISOString().split("T")[0];
        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push(event);
        current.setDate(current.getDate() + 1);
      }
    }
    return map;
  }, [events]);

  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(currentYear, currentMonth);
    const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
    const prevDays = getDaysInMonth(currentYear, currentMonth - 1);

    const days: { day: number; currentMonth: boolean; date: string }[] = [];

    // Previous month days
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevDays - i;
      const dt = new Date(currentYear, currentMonth - 1, d);
      days.push({ day: d, currentMonth: false, date: formatDate(dt) });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const dt = new Date(currentYear, currentMonth, i);
      days.push({ day: i, currentMonth: true, date: formatDate(dt) });
    }

    // Next month days to fill grid
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const dt = new Date(currentYear, currentMonth + 1, i);
      days.push({ day: i, currentMonth: false, date: formatDate(dt) });
    }

    return days;
  }, [currentYear, currentMonth]);

  function goToPrevMonth() {
    if (currentMonth === 0) {
      setCurrentYear(currentYear - 1);
      setCurrentMonth(11);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  }

  function goToNextMonth() {
    if (currentMonth === 11) {
      setCurrentYear(currentYear + 1);
      setCurrentMonth(0);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  }

  function goToToday() {
    const now = new Date();
    setCurrentYear(now.getFullYear());
    setCurrentMonth(now.getMonth());
  }

  function resetForm() {
    setFormTitle("");
    setFormDescription("");
    setFormStartAt("");
    setFormEndAt("");
    setFormAllDay(false);
    setFormColor("#3b82f6");
    setFormLocation("");
    setFormRecurrence("");
    setEditingEvent(null);
    setSelectedDate(null);
  }

  function openCreateModal(date?: string) {
    resetForm();
    if (date) {
      setSelectedDate(date);
      const dt = new Date(date + "T09:00:00");
      setFormStartAt(formatDateTimeLocal(dt));
      const dtEnd = new Date(date + "T10:00:00");
      setFormEndAt(formatDateTimeLocal(dtEnd));
    } else {
      const now = new Date();
      now.setMinutes(0, 0, 0);
      setFormStartAt(formatDateTimeLocal(now));
      const end = new Date(now.getTime() + 3600000);
      setFormEndAt(formatDateTimeLocal(end));
    }
    setShowModal(true);
  }

  function openEditModal(ev: CalendarEvent) {
    setEditingEvent(ev);
    setFormTitle(ev.title);
    setFormDescription(ev.description || "");
    setFormStartAt(formatDateTimeLocal(new Date(ev.startAt)));
    setFormEndAt(ev.endAt ? formatDateTimeLocal(new Date(ev.endAt)) : "");
    setFormAllDay(ev.allDay);
    setFormColor(ev.color || "#3b82f6");
    setFormLocation(ev.location || "");
    setFormRecurrence(ev.recurrence || "");
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim() || !formStartAt) return;

    const payload = {
      title: formTitle.trim(),
      description: formDescription.trim() || null,
      startAt: new Date(formStartAt).toISOString(),
      endAt: formEndAt ? new Date(formEndAt).toISOString() : null,
      allDay: formAllDay,
      color: formColor,
      location: formLocation.trim() || null,
      recurrence: formRecurrence || null,
    };

    try {
      if (editingEvent) {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/calendar/${editingEvent.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        if (!res.ok) throw new Error();
      } else {
        const res = await fetch(`/api/workspaces/${workspaceId}/calendar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();
      }

      setShowModal(false);
      resetForm();
      fetchEvents();
      setSuccessToast("일정이 저장되었습니다");
    } catch (error) {
      setErrorMessage("일정 저장에 실패했습니다. 다시 시도해주세요.");
    }
  }

  function requestDelete() {
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    setConfirmingDelete(true);
    deleteTimerRef.current = setTimeout(() => {
      setConfirmingDelete(false);
    }, 4000);
  }

  async function handleDelete() {
    if (!editingEvent) return;
    setConfirmingDelete(false);

    try {
      await fetch(
        `/api/workspaces/${workspaceId}/calendar/${editingEvent.id}`,
        { method: "DELETE" }
      );
      setShowModal(false);
      resetForm();
      fetchEvents();
      setSuccessToast("일정이 삭제되었습니다");
    } catch (error) {
      setErrorMessage("일정 삭제에 실패했습니다. 다시 시도해주세요.");
    }
  }

  async function handleQuickAdd() {
    if (!quickAddTitle.trim() || !quickAddDate) return;
    const startAt = new Date(quickAddDate + "T09:00:00").toISOString();
    const endAt = new Date(quickAddDate + "T10:00:00").toISOString();
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/calendar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: quickAddTitle.trim(),
          description: null,
          startAt,
          endAt,
          allDay: false,
          color: "#3b82f6",
          location: null,
          recurrence: null,
        }),
      });
      if (!res.ok) throw new Error();
      setQuickAddDate(null);
      setQuickAddTitle("");
      fetchEvents();
      setSuccessToast("일정이 저장되었습니다");
    } catch {
      setErrorMessage("일정 저장에 실패했습니다. 다시 시도해주세요.");
    }
  }

  // Focus the quick-add input when it appears
  useEffect(() => {
    if (quickAddDate && quickAddInputRef.current) {
      quickAddInputRef.current.focus();
    }
  }, [quickAddDate]);

  const todayStr = formatDate(today);

  return (
    <div style={{ width: "100%", margin: "0 auto" }}>
      {/* CSS keyframes for spinner and toast animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Calendar size={24} style={{ color: "var(--primary)" }} />
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "var(--foreground)",
              margin: 0,
            }}
          >
            {currentYear}년 {currentMonth + 1}월
          </h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Google Calendar 연동 섹션 */}
          {googleConnected ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginRight: 12,
                padding: "4px 10px",
                borderRadius: 6,
                border: "1px solid var(--border)",
                background: "var(--muted)",
                fontSize: 12,
              }}
            >
              {syncing ? (
                <>
                  <Loader2
                    size={14}
                    style={{
                      color: "var(--primary)",
                      animation: "spin 1s linear infinite",
                    }}
                  />
                  <span style={{ color: "var(--foreground)", opacity: 0.8 }}>
                    동기화 중...
                  </span>
                </>
              ) : (
                <>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#22c55e",
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      color: "var(--foreground)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Google Calendar 연결됨
                  </span>
                  {lastSyncAt && (
                    <span
                      style={{
                        color: "var(--foreground)",
                        opacity: 0.5,
                        fontSize: 11,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {new Date(lastSyncAt).toLocaleString("ko-KR", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                  <button
                    onClick={handleSync}
                    title="동기화"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--foreground)",
                      padding: 2,
                      display: "flex",
                      alignItems: "center",
                      opacity: 0.7,
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.opacity = "1";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.opacity = "0.7";
                    }}
                  >
                    <RefreshCw size={14} />
                  </button>
                  {confirmDisconnect ? (
                    <span className="flex items-center gap-1 text-xs">
                      <span style={{ color: "#ef4444" }}>정말 해제?</span>
                      <button
                        onClick={() => { handleDisconnect(); setConfirmDisconnect(false); }}
                        className="hover:opacity-70 px-1 rounded"
                        style={{ color: "#ef4444", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}
                      >
                        확인
                      </button>
                      <button
                        onClick={() => setConfirmDisconnect(false)}
                        className="hover:opacity-70 px-1 rounded"
                        style={{ color: "var(--muted)", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}
                      >
                        취소
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => {
                        setConfirmDisconnect(true);
                        setTimeout(() => setConfirmDisconnect(false), 5000);
                      }}
                      title="연결 해제"
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--foreground)",
                        padding: 2,
                        display: "flex",
                        alignItems: "center",
                        opacity: 0.5,
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.opacity = "1";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.opacity = "0.5";
                      }}
                    >
                      <Unlink size={14} />
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <button
              onClick={handleGoogleConnect}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "6px 12px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--foreground)",
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginRight: 12,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "var(--muted)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background =
                  "transparent";
              }}
            >
              <Link2 size={14} />
              Google Calendar 연결
            </button>
          )}

          <button
            onClick={goToPrevMonth}
            style={{
              background: "var(--muted)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "6px 8px",
              cursor: "pointer",
              color: "var(--foreground)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={goToToday}
            style={{
              background: "var(--muted)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "6px 14px",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--foreground)",
            }}
          >
            오늘
          </button>
          <button
            onClick={goToNextMonth}
            style={{
              background: "var(--muted)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "6px 8px",
              cursor: "pointer",
              color: "var(--foreground)",
              display: "flex",
              alignItems: "center",
            }}
          >
            <ChevronRight size={18} />
          </button>

          <button
            onClick={() => openCreateModal()}
            style={{
              background: "var(--primary)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "6px 14px",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: 4,
              marginLeft: 8,
            }}
          >
            <Plus size={16} />
            새 일정
          </button>
        </div>
      </div>

      {/* 동기화 결과 토스트 */}
      {syncResult && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 16px",
            borderRadius: 8,
            background: "var(--muted)",
            border: "1px solid var(--border)",
            fontSize: 13,
            color: "var(--foreground)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            animation: "fadeIn 0.2s ease-in",
          }}
        >
          <RefreshCw size={14} style={{ color: "var(--primary)" }} />
          동기화 완료: {syncResult.created}건 생성, {syncResult.updated}건
          업데이트
        </div>
      )}

      {/* Error message */}
      {errorMessage && (
        <div
          style={{
            marginBottom: 16,
            padding: "10px 16px",
            borderRadius: 8,
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            fontSize: 13,
            color: "#ef4444",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#ef4444",
              fontSize: 16,
              lineHeight: 1,
              padding: 2,
            }}
          >
            &times;
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div
          style={{
            textAlign: "center",
            padding: 20,
            color: "var(--foreground)",
            opacity: 0.6,
          }}
        >
          불러오는 중...
        </div>
      )}

      {/* Empty state hint */}
      {!loading && events.length === 0 && !errorMessage && (
        <div
          style={{
            textAlign: "center",
            padding: "12px 16px",
            marginBottom: 16,
            borderRadius: 8,
            background: "var(--sidebar-bg)",
            border: "1px solid var(--border)",
            fontSize: 13,
            color: "var(--muted)",
          }}
        >
          일정이 없습니다. 날짜를 클릭하여 새 일정을 추가하세요.
        </div>
      )}

      {/* Calendar Grid */}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 8,
          overflow: "hidden",
          background: "var(--background)",
        }}
      >
        {/* Weekday Header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          {WEEKDAYS.map((day, i) => (
            <div
              key={day}
              style={{
                padding: isMobile ? "6px 2px" : "10px 4px",
                textAlign: "center",
                fontSize: isMobile ? 11 : 13,
                fontWeight: 600,
                color:
                  i === 0
                    ? "rgba(239,68,68,0.8)"
                    : i === 6
                      ? "rgba(59,130,246,0.8)"
                      : "var(--foreground)",
                background: "var(--muted)",
              }}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
          }}
        >
          {calendarDays.map((dayInfo, idx) => {
            const dayEvents = eventsByDate[dayInfo.date] || [];
            const isToday = dayInfo.date === todayStr;
            const dayOfWeek = idx % 7;

            return (
              <div
                key={idx}
                role="gridcell"
                tabIndex={dayInfo.currentMonth ? 0 : -1}
                onClick={() => {
                  if (dayInfo.currentMonth && quickAddDate !== dayInfo.date) {
                    setQuickAddDate(dayInfo.date);
                    setQuickAddTitle("");
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && dayInfo.currentMonth) {
                    e.preventDefault();
                    setQuickAddDate(dayInfo.date);
                    setQuickAddTitle("");
                  }
                }}
                style={{
                  minHeight: isMobile ? 64 : 96,
                  borderRight:
                    dayOfWeek < 6 ? "1px solid var(--border)" : "none",
                  borderBottom: "1px solid var(--border)",
                  padding: 4,
                  cursor: dayInfo.currentMonth ? "pointer" : "default",
                  opacity: dayInfo.currentMonth ? 1 : 0.35,
                  background: isToday
                    ? "color-mix(in srgb, var(--primary) 8%, var(--background))"
                    : "var(--background)",
                }}
              >
                <div
                  style={{
                    fontSize: isMobile ? 11 : 13,
                    fontWeight: isToday ? 700 : 400,
                    color: isToday
                      ? "var(--primary)"
                      : dayOfWeek === 0
                        ? "rgba(239,68,68,0.8)"
                        : dayOfWeek === 6
                          ? "rgba(59,130,246,0.8)"
                          : "var(--foreground)",
                    padding: "2px 4px",
                    borderRadius: isToday ? "50%" : 0,
                    display: "inline-block",
                    width: isToday ? 24 : "auto",
                    height: isToday ? 24 : "auto",
                    textAlign: "center",
                    lineHeight: isToday ? "24px" : "normal",
                    background: isToday ? "var(--primary)" : "transparent",
                    ...(isToday ? { color: "#fff" } : {}),
                  }}
                >
                  {dayInfo.day}
                </div>

                <div style={{ marginTop: 2 }}>
                  {isMobile ? (
                    /* Mobile condensed view: event count dot */
                    dayEvents.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "center",
                          alignItems: "center",
                          gap: 2,
                          marginTop: 4,
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: dayEvents[0].color || "var(--primary)",
                            display: "inline-block",
                          }}
                        />
                        {dayEvents.length > 1 && (
                          <span style={{ fontSize: 9, color: "var(--muted)" }}>
                            +{dayEvents.length - 1}
                          </span>
                        )}
                      </div>
                    )
                  ) : (
                    /* Desktop full view */
                    <>
                      {dayEvents.slice(0, 3).map((ev) => (
                        <div
                          key={ev.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditModal(ev);
                          }}
                          style={{
                            fontSize: 11,
                            padding: "1px 4px",
                            marginBottom: 1,
                            borderRadius: 3,
                            background: ev.color || "var(--primary)",
                            color: "#fff",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: "none",
                            cursor: "pointer",
                            lineHeight: "16px",
                            display: "flex",
                            alignItems: "center",
                            gap: 2,
                          }}
                          title={`${ev.title}${ev.recurrence ? ` (${RECURRENCE_LABELS[ev.recurrence] || ev.recurrence})` : ""}`}
                        >
                          {ev.recurrence && (
                            <Repeat size={9} style={{ opacity: 0.85, flexShrink: 0 }} />
                          )}
                          {!ev.allDay && (
                            <span style={{ opacity: 0.8 }}>
                              {formatTime(ev.startAt)}
                            </span>
                          )}
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{ev.title}</span>
                        </div>
                      ))}
                      {dayEvents.length > 3 && (
                        <div
                          style={{
                            fontSize: 10,
                            color: "var(--foreground)",
                            opacity: 0.6,
                            paddingLeft: 4,
                          }}
                        >
                          +{dayEvents.length - 3}개 더
                        </div>
                      )}
                    </>
                  )}
                  {quickAddDate === dayInfo.date && (
                    <div
                      style={{ marginTop: 2 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        ref={quickAddInputRef}
                        type="text"
                        value={quickAddTitle}
                        onChange={(e) => setQuickAddTitle(e.target.value)}
                        placeholder="일정 제목"
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleQuickAdd();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            setQuickAddDate(null);
                            setQuickAddTitle("");
                          }
                        }}
                        onBlur={() => {
                          // Delay to allow Enter to fire first
                          setTimeout(() => {
                            setQuickAddDate(null);
                            setQuickAddTitle("");
                          }, 150);
                        }}
                        style={{
                          width: "100%",
                          fontSize: 11,
                          padding: "2px 4px",
                          borderRadius: 3,
                          border: "1px solid var(--primary)",
                          background: "var(--background)",
                          color: "var(--foreground)",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div
          onClick={() => {
            setShowModal(false);
            resetForm();
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={editingEvent ? "일정 수정" : "일정 추가"}
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--background)",
              borderRadius: 12,
              border: "1px solid var(--border)",
              width: "100%",
              maxWidth: 480,
              maxHeight: "90vh",
              overflow: "auto",
              padding: 24,
              boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 20,
              }}
            >
              <h2
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: "var(--foreground)",
                  margin: 0,
                }}
              >
                {editingEvent ? "일정 수정" : "새 일정"}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--foreground)",
                  padding: 4,
                }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {/* Title */}
              <div style={{ marginBottom: 14 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--foreground)",
                    marginBottom: 4,
                  }}
                >
                  제목 *
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="일정 제목을 입력하세요"
                  required
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--background)",
                    color: "var(--foreground)",
                    fontSize: 14,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Description */}
              <div style={{ marginBottom: 14 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--foreground)",
                    marginBottom: 4,
                  }}
                >
                  설명
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="설명을 입력하세요 (선택)"
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--background)",
                    color: "var(--foreground)",
                    fontSize: 14,
                    outline: "none",
                    resize: "vertical",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* All Day Toggle */}
              <div
                style={{
                  marginBottom: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <input
                  type="checkbox"
                  id="allDay"
                  checked={formAllDay}
                  onChange={(e) => setFormAllDay(e.target.checked)}
                  style={{ accentColor: "var(--primary)" }}
                />
                <label
                  htmlFor="allDay"
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--foreground)",
                    cursor: "pointer",
                  }}
                >
                  종일
                </label>
              </div>

              {/* Start / End */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                  marginBottom: 14,
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--foreground)",
                      marginBottom: 4,
                    }}
                  >
                    <Clock
                      size={12}
                      style={{ marginRight: 4, verticalAlign: "middle" }}
                    />
                    시작 *
                  </label>
                  <input
                    type={formAllDay ? "date" : "datetime-local"}
                    value={
                      formAllDay
                        ? formStartAt.slice(0, 10)
                        : formStartAt
                    }
                    onChange={(e) =>
                      setFormStartAt(
                        formAllDay
                          ? e.target.value + "T00:00:00"
                          : e.target.value
                      )
                    }
                    required
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "var(--background)",
                      color: "var(--foreground)",
                      fontSize: 13,
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: 13,
                      fontWeight: 500,
                      color: "var(--foreground)",
                      marginBottom: 4,
                    }}
                  >
                    <Clock
                      size={12}
                      style={{ marginRight: 4, verticalAlign: "middle" }}
                    />
                    종료
                  </label>
                  <input
                    type={formAllDay ? "date" : "datetime-local"}
                    value={
                      formAllDay
                        ? formEndAt.slice(0, 10)
                        : formEndAt
                    }
                    onChange={(e) =>
                      setFormEndAt(
                        formAllDay
                          ? e.target.value + "T23:59:59"
                          : e.target.value
                      )
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "var(--background)",
                      color: "var(--foreground)",
                      fontSize: 13,
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              {/* Location */}
              <div style={{ marginBottom: 14 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--foreground)",
                    marginBottom: 4,
                  }}
                >
                  <MapPin
                    size={12}
                    style={{ marginRight: 4, verticalAlign: "middle" }}
                  />
                  장소
                </label>
                <input
                  type="text"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  placeholder="장소 (선택)"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--background)",
                    color: "var(--foreground)",
                    fontSize: 14,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Recurrence */}
              <div style={{ marginBottom: 14 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--foreground)",
                    marginBottom: 4,
                  }}
                >
                  <Repeat
                    size={12}
                    style={{ marginRight: 4, verticalAlign: "middle" }}
                  />
                  반복
                </label>
                <select
                  value={formRecurrence}
                  onChange={(e) => setFormRecurrence(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--background)",
                    color: "var(--foreground)",
                    fontSize: 14,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                >
                  <option value="">반복 없음</option>
                  <option value="daily">매일</option>
                  <option value="weekly">매주</option>
                  <option value="monthly">매월</option>
                </select>
              </div>

              {/* Color */}
              <div style={{ marginBottom: 20 }}>
                <label
                  style={{
                    display: "block",
                    fontSize: 13,
                    fontWeight: 500,
                    color: "var(--foreground)",
                    marginBottom: 6,
                  }}
                >
                  색상
                </label>
                <div style={{ display: "flex", gap: 6 }}>
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFormColor(c)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: "50%",
                        background: c,
                        border:
                          formColor === c
                            ? "3px solid var(--foreground)"
                            : "2px solid transparent",
                        cursor: "pointer",
                        outline: "none",
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  {editingEvent && !confirmingDelete && (
                    <button
                      type="button"
                      onClick={requestDelete}
                      style={{
                        background: "none",
                        border: "1px solid rgba(239,68,68,0.6)",
                        color: "rgba(239,68,68,0.6)",
                        borderRadius: 6,
                        padding: "7px 14px",
                        cursor: "pointer",
                        fontSize: 13,
                        display: "flex",
                        alignItems: "center",
                        gap: 4,
                      }}
                    >
                      <Trash2 size={14} />
                      삭제
                    </button>
                  )}
                  {editingEvent && confirmingDelete && (
                    <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                      <span style={{ color: "rgba(239,68,68,0.9)" }}>정말 삭제하시겠습니까?</span>
                      <button
                        type="button"
                        onClick={handleDelete}
                        style={{
                          background: "rgba(239,68,68,0.9)",
                          color: "#fff",
                          border: "none",
                          borderRadius: 6,
                          padding: "5px 12px",
                          cursor: "pointer",
                          fontSize: 13,
                        }}
                      >
                        삭제
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDelete(false)}
                        style={{
                          background: "none",
                          border: "1px solid var(--border)",
                          borderRadius: 6,
                          padding: "5px 12px",
                          cursor: "pointer",
                          fontSize: 13,
                        }}
                      >
                        취소
                      </button>
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      resetForm();
                    }}
                    style={{
                      background: "var(--muted)",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      padding: "7px 18px",
                      cursor: "pointer",
                      fontSize: 13,
                      color: "var(--foreground)",
                    }}
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    style={{
                      background: "var(--primary)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      padding: "7px 18px",
                      cursor: "pointer",
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    {editingEvent ? "수정" : "생성"}
                  </button>
                </div>
              </div>
            </form>

            {/* Event details when editing */}
            {editingEvent && (
              <div
                style={{
                  marginTop: 16,
                  padding: 12,
                  borderRadius: 6,
                  background: "var(--muted)",
                  fontSize: 12,
                  color: "var(--foreground)",
                  opacity: 0.7,
                }}
              >
                <div>
                  작성자: {editingEvent.createdBy.name} (
                  {editingEvent.createdBy.email})
                </div>
                {editingEvent.location && (
                  <div style={{ marginTop: 4 }}>
                    <MapPin
                      size={11}
                      style={{ marginRight: 4, verticalAlign: "middle" }}
                    />
                    {editingEvent.location}
                  </div>
                )}
                {editingEvent.recurrence && (
                  <div style={{ marginTop: 4 }}>
                    <Repeat
                      size={11}
                      style={{ marginRight: 4, verticalAlign: "middle" }}
                    />
                    {RECURRENCE_LABELS[editingEvent.recurrence] ||
                      editingEvent.recurrence}
                  </div>
                )}
                {editingEvent.page && (
                  <div style={{ marginTop: 4 }}>
                    연결된 페이지: {editingEvent.page.title}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {successToast && (
        <div className="fixed bottom-4 right-4 z-[100] px-4 py-2.5 rounded-lg shadow-lg text-sm"
          style={{ background: "var(--foreground)", color: "var(--background)" }}>
          {successToast}
        </div>
      )}
    </div>
  );
}
