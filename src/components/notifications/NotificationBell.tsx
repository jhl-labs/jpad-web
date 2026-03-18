"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Clock,
  AtSign,
  UserPlus,
  Info,
  CheckCircle2,
  CheckCheck,
} from "lucide-react";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  readAt: string | null;
  link: string | null;
  workspaceId: string | null;
  createdAt: string;
}

function getRelativeTime(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "방금 전";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}개월 전`;

  return `${Math.floor(months / 12)}년 전`;
}

function getTypeIcon(type: string) {
  switch (type) {
    case "todo_due":
      return <CheckCircle2 size={14} style={{ color: "rgba(245,158,11,0.8)" }} />;
    case "event_reminder":
      return <Clock size={14} style={{ color: "var(--primary)" }} />;
    case "mention":
      return <AtSign size={14} style={{ color: "rgba(139,92,246,0.8)" }} />;
    case "assignment":
      return <UserPlus size={14} style={{ color: "rgba(16,185,129,0.8)" }} />;
    case "system":
    default:
      return <Info size={14} style={{ color: "var(--muted)" }} />;
  }
}

interface NotificationBellProps {
  workspaceId?: string;
}

export function NotificationBell({ workspaceId }: NotificationBellProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "20" });
      if (workspaceId) params.set("workspaceId", workspaceId);

      const res = await fetch(`/api/notifications?${params}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.data);
        setUnreadCount(data.unreadCount);
      }
    } catch (_error) {
      // ignore
    }
  }, [workspaceId]);

  // Cache poll interval config to avoid re-reading localStorage on each effect run
  const pollIntervalMsRef = useRef<number | null>(null);
  if (pollIntervalMsRef.current === null) {
    try {
      const raw = localStorage.getItem("notification-poll-interval");
      if (raw === "off") {
        pollIntervalMsRef.current = -1; // sentinel: polling disabled
      } else {
        const ms = raw ? parseInt(raw, 10) : 30000;
        pollIntervalMsRef.current = isNaN(ms) || ms < 5000 ? 30000 : ms;
      }
    } catch (_error) {
      pollIntervalMsRef.current = 30000;
    }
  }

  // Initial fetch and polling with configurable interval from localStorage
  useEffect(() => {
    fetchNotifications();

    if (pollIntervalMsRef.current === -1) return;

    const interval = setInterval(fetchNotifications, pollIntervalMsRef.current!);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close panel on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  async function handleNotificationClick(notification: Notification) {
    // Mark as read
    if (!notification.read) {
      await fetch(`/api/notifications/${notification.id}`, { method: "PATCH" });
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notification.id ? { ...n, read: true, readAt: new Date().toISOString() } : n
        )
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }

    // Navigate
    if (notification.link) {
      router.push(notification.link);
      setOpen(false);
    }
  }

  async function handleReadAll() {
    await fetch("/api/notifications/read-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId }),
    });
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read: true, readAt: new Date().toISOString() }))
    );
    setUnreadCount(0);
  }

  return (
    <div ref={panelRef} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="relative p-1.5 rounded hover:opacity-70 transition-opacity"
        title="알림"
        aria-label="알림"
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span
            aria-live="polite"
            aria-atomic="true"
            className="absolute -top-0.5 -right-0.5 flex items-center justify-center text-white text-[10px] font-bold rounded-full"
            style={{
              background: "var(--danger, #ef4444)",
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              lineHeight: 1,
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1 z-[90] rounded-lg shadow-xl overflow-hidden"
          style={{
            background: "var(--background)",
            border: "1px solid var(--border)",
            maxWidth: "min(320px, calc(100vw - 2rem))",
            width: 320,
            maxHeight: 420,
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-2.5"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <span className="text-sm font-semibold">알림</span>
            {unreadCount > 0 && (
              <button
                onClick={handleReadAll}
                className="flex items-center gap-1 text-xs hover:opacity-70 transition-opacity"
                style={{ color: "var(--primary)" }}
              >
                <CheckCheck size={12} />
                모두 읽음
              </button>
            )}
          </div>

          {/* Notification list */}
          <div className="overflow-auto" style={{ maxHeight: 360 }}>
            {notifications.length === 0 ? (
              <div
                className="flex flex-col items-center justify-center py-8 text-sm"
                style={{ color: "var(--muted)" }}
              >
                <Bell size={24} className="mb-2 opacity-40" />
                알림이 없습니다
                <p className="text-xs mt-1 text-center" style={{ color: "var(--muted)", opacity: 0.7 }}>
                  멘션, 마감일 알림 등이 여기에 표시됩니다.
                </p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  role="menuitem"
                  tabIndex={0}
                  className="flex items-start gap-2.5 px-3 py-2.5 cursor-pointer transition-colors"
                  style={{
                    background: notification.read ? "transparent" : "var(--sidebar-hover)",
                    borderBottom: "1px solid var(--border)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--sidebar-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = notification.read
                      ? "transparent"
                      : "var(--sidebar-hover)";
                  }}
                  onClick={() => handleNotificationClick(notification)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleNotificationClick(notification);
                    }
                  }}
                >
                  <span className="mt-0.5 shrink-0">
                    {getTypeIcon(notification.type)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="text-sm font-medium truncate"
                        style={{ color: "var(--foreground)" }}
                      >
                        {notification.title}
                      </span>
                      {!notification.read && (
                        <span
                          className="shrink-0 rounded-full"
                          style={{
                            width: 6,
                            height: 6,
                            background: "var(--primary)",
                          }}
                        />
                      )}
                    </div>
                    <p
                      className="text-xs mt-0.5 line-clamp-2"
                      style={{ color: "var(--muted)" }}
                    >
                      {notification.message}
                    </p>
                    <span
                      className="text-[11px] mt-1 block"
                      style={{ color: "var(--muted)", opacity: 0.7 }}
                    >
                      {getRelativeTime(notification.createdAt)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
