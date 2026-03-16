"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Save,
  Loader2,
  ExternalLink,
} from "lucide-react";

interface DailyPage {
  id: string;
  title: string;
  slug: string;
}

const DAY_NAMES_SHORT = ["일", "월", "화", "수", "목", "금", "토"];
const DAY_NAMES = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
const MONTH_NAMES = [
  "1월", "2월", "3월", "4월", "5월", "6월",
  "7월", "8월", "9월", "10월", "11월", "12월",
];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DAY_NAMES[d.getDay()]}`;
}

function toDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

function getMonthStr(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function getCalendarDays(year: number, month: number): (number | null)[] {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  return days;
}

export default function DailyNotePage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const router = useRouter();

  const today = toDateStr(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [page, setPage] = useState<DailyPage | null>(null);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [existingDates, setExistingDates] = useState<Set<string>>(new Set());
  const [calendarMonth, setCalendarMonth] = useState(getMonthStr(today));
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const hasChanges = content !== savedContent;

  // 데일리 노트 로드
  const loadDailyNote = useCallback(
    async (date: string) => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/daily?date=${date}`
        );
        if (res.ok) {
          const data = await res.json();
          setPage(data);

          // 내용 로드
          const contentRes = await fetch(`/api/pages/${data.id}/content`);
          if (contentRes.ok) {
            const { content: c } = await contentRes.json();
            setContent(c || "");
            setSavedContent(c || "");
          }
        }
      } catch (e) {
        console.error("Failed to load daily note:", e);
      } finally {
        setLoading(false);
      }
    },
    [workspaceId]
  );

  // 날짜 목록 로드
  const loadDateList = useCallback(
    async (month: string) => {
      try {
        const res = await fetch(
          `/api/workspaces/${workspaceId}/daily/list?month=${month}`
        );
        if (res.ok) {
          const data = await res.json();
          setExistingDates((prev) => {
            const next = new Set(prev);
            data.dates.forEach((d: string) => next.add(d));
            return next;
          });
        }
      } catch (_error) {
        // ignore
      }
    },
    [workspaceId]
  );

  useEffect(() => {
    loadDailyNote(selectedDate);
  }, [selectedDate, loadDailyNote]);

  useEffect(() => {
    loadDateList(calendarMonth);
  }, [calendarMonth, loadDateList]);

  // 캘린더 월이 선택 날짜와 다르면 동기화
  useEffect(() => {
    const m = getMonthStr(selectedDate);
    if (m !== calendarMonth) {
      setCalendarMonth(m);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // 저장
  const saveContent = useCallback(async () => {
    if (!page || content === savedContent) return;
    setSaving(true);
    try {
      await fetch(`/api/pages/${page.id}/content`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      setSavedContent(content);
    } catch (e) {
      console.error("Failed to save:", e);
    } finally {
      setSaving(false);
    }
  }, [page, content, savedContent]);

  // 자동 저장 (2초 딜레이)
  useEffect(() => {
    if (!hasChanges) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveContent();
    }, 2000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [content, hasChanges, saveContent]);

  // 페이지 이탈 전 저장
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasChanges]);

  // Ctrl+S 저장
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveContent();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [saveContent]);

  // 캘린더 계산
  const calYear = parseInt(calendarMonth.split("-")[0]);
  const calMonth = parseInt(calendarMonth.split("-")[1]) - 1;
  const calDays = getCalendarDays(calYear, calMonth);

  function prevCalMonth() {
    const d = new Date(calYear, calMonth - 1, 1);
    setCalendarMonth(toDateStr(d).slice(0, 7));
  }

  function nextCalMonth() {
    const d = new Date(calYear, calMonth + 1, 1);
    setCalendarMonth(toDateStr(d).slice(0, 7));
  }

  function selectCalDate(day: number) {
    const m = String(calMonth + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    setSelectedDate(`${calYear}-${m}-${d}`);
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* 날짜 네비게이션 */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <button
            onClick={() => setSelectedDate(addDays(selectedDate, -1))}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors"
            style={{
              border: "1px solid var(--border)",
              color: "var(--foreground)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--sidebar-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <ChevronLeft size={16} />
            어제
          </button>

          <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-lg font-semibold"
            style={{ background: "var(--sidebar-bg)" }}
          >
            <CalendarDays size={20} style={{ color: "var(--primary)" }} />
            {formatDate(selectedDate)}
          </div>

          <button
            onClick={() => setSelectedDate(addDays(selectedDate, 1))}
            className="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors"
            style={{
              border: "1px solid var(--border)",
              color: "var(--foreground)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--sidebar-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            내일
            <ChevronRight size={16} />
          </button>
        </div>

        {/* 오늘 버튼 */}
        {selectedDate !== today && (
          <div className="flex justify-center mb-4">
            <button
              onClick={() => setSelectedDate(today)}
              className="px-4 py-1.5 rounded-full text-sm font-medium transition-colors"
              style={{
                background: "var(--primary)",
                color: "white",
              }}
            >
              오늘로 이동
            </button>
          </div>
        )}

        {/* 미니 캘린더 */}
        <div
          className="rounded-lg p-4 mb-6"
          style={{
            background: "var(--sidebar-bg)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={prevCalMonth}
              className="p-1 rounded hover:opacity-70"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-semibold">
              {calYear}년 {MONTH_NAMES[calMonth]}
            </span>
            <button
              onClick={nextCalMonth}
              className="p-1 rounded hover:opacity-70"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {DAY_NAMES_SHORT.map((d) => (
              <div
                key={d}
                className="text-xs font-medium py-1"
                style={{ color: "var(--muted)" }}
              >
                {d}
              </div>
            ))}
            {calDays.map((day, idx) => {
              if (day === null) {
                return <div key={`empty-${idx}`} />;
              }
              const m = String(calMonth + 1).padStart(2, "0");
              const d = String(day).padStart(2, "0");
              const dateStr = `${calYear}-${m}-${d}`;
              const isToday = dateStr === today;
              const isSelected = dateStr === selectedDate;
              const hasNote = existingDates.has(dateStr);

              return (
                <button
                  key={dateStr}
                  onClick={() => selectCalDate(day)}
                  className="relative flex flex-col items-center justify-center py-1 rounded text-sm transition-colors"
                  style={{
                    background: isSelected
                      ? "var(--primary)"
                      : isToday
                      ? "var(--sidebar-hover)"
                      : "transparent",
                    color: isSelected ? "white" : "var(--foreground)",
                    fontWeight: isToday ? 700 : 400,
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = "var(--sidebar-hover)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = isToday
                        ? "var(--sidebar-hover)"
                        : "transparent";
                    }
                  }}
                >
                  {day}
                  {hasNote && (
                    <span
                      className="absolute bottom-0.5 w-1 h-1 rounded-full"
                      style={{
                        background: isSelected ? "white" : "var(--primary)",
                      }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 에디터 영역 */}
        {loading ? (
          <div
            className="flex items-center justify-center py-20"
            style={{ color: "var(--muted)" }}
          >
            <Loader2 size={24} className="animate-spin mr-2" />
            로딩 중...
          </div>
        ) : (
          <div>
            {/* 저장 상태 바 */}
            <div className="flex items-center justify-between mb-3">
              <h2
                className="text-sm font-medium"
                style={{ color: "var(--muted)" }}
              >
                {page?.title || ""}
              </h2>
              <div className="flex items-center gap-2">
                {saving && (
                  <span
                    className="flex items-center gap-1 text-xs"
                    style={{ color: "var(--muted)" }}
                  >
                    <Loader2 size={12} className="animate-spin" />
                    저장 중...
                  </span>
                )}
                {!saving && hasChanges && (
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    수정됨
                  </span>
                )}
                {!saving && !hasChanges && savedContent && (
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    저장됨
                  </span>
                )}
                <button
                  onClick={saveContent}
                  disabled={!hasChanges || saving}
                  className="flex items-center gap-1 px-3 py-1 rounded text-sm transition-colors disabled:opacity-50"
                  style={{
                    background: hasChanges ? "var(--primary)" : "var(--sidebar-bg)",
                    color: hasChanges ? "white" : "var(--muted)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <Save size={14} />
                  저장
                </button>
              </div>
            </div>

            {/* 마크다운 textarea */}
            <div
              className="rounded-lg overflow-hidden"
              style={{ border: "1px solid var(--border)" }}
            >
              <div
                className="flex items-center justify-between px-4 py-2"
                style={{
                  background: "var(--sidebar-bg)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span
                  className="text-xs font-medium"
                  style={{ color: "var(--muted)" }}
                >
                  마크다운
                </span>
                <span
                  className="text-xs"
                  style={{ color: "var(--muted)" }}
                >
                  {content.length}자
                </span>
              </div>
              <textarea
                value={content}
                onChange={(e) => {
                  setContent(e.target.value);
                  // Auto-resize
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = `${Math.max(400, target.scrollHeight)}px`;
                }}
                className="w-full p-4 text-sm leading-relaxed resize-none focus:outline-none"
                style={{
                  background: "var(--background)",
                  color: "var(--foreground)",
                  minHeight: "400px",
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, Consolas, monospace",
                  fontSize: "13px",
                  lineHeight: "1.8",
                  tabSize: 2,
                }}
                placeholder="여기에 오늘의 기록을 작성하세요...

# 제목
## 소제목
- 할 일 목록
- **굵게**, *기울임*"
                spellCheck={false}
              />
            </div>

            {/* 전체 에디터에서 열기 버튼 */}
            {page && (
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() =>
                    router.push(
                      `/workspace/${workspaceId}/page/${page.id}`
                    )
                  }
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-90"
                  style={{
                    background: "var(--primary)",
                    color: "white",
                  }}
                >
                  <ExternalLink size={14} />
                  전체 에디터에서 열기
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
