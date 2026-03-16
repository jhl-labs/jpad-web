"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { ListTree, ChevronRight, ChevronDown } from "lucide-react";

export interface TocItem {
  id: string;
  text: string;
  level: 1 | 2 | 3;
}

/**
 * 마크다운 문자열에서 H1/H2/H3 헤딩을 추출합니다.
 */
export function parseHeadings(content: string): TocItem[] {
  if (!content) return [];
  const lines = content.split("\n");
  const items: TocItem[] = [];
  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      const level = match[1].length as 1 | 2 | 3;
      const text = match[2].trim();
      // kebab-case ID 생성
      const id = text
        .toLowerCase()
        .replace(/[^\w\s가-힣ㄱ-ㅎㅏ-ㅣ-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      items.push({ id: id || `heading-${items.length}`, text, level });
    }
  }
  return items;
}

interface TableOfContentsProps {
  content: string;
  editorContainerRef?: React.RefObject<HTMLDivElement | null>;
}

export function TableOfContents({ content, editorContainerRef }: TableOfContentsProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const tocRef = useRef<HTMLDivElement>(null);

  // 300ms 디바운스된 content로 parseHeadings 실행
  const [debouncedContent, setDebouncedContent] = useState(content);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedContent(content), 300);
    return () => clearTimeout(timer);
  }, [content]);

  const headings = useMemo(() => parseHeadings(debouncedContent), [debouncedContent]);

  // 스크롤 위치에 따라 현재 보이는 헤딩 감지
  const handleScroll = useCallback(() => {
    if (!editorContainerRef?.current || headings.length === 0) return;

    const container = editorContainerRef.current;
    // BlockNote는 heading 블록에 data-block-type="heading"을 사용
    const headingElements = container.querySelectorAll(
      '[data-content-type="heading"], h1, h2, h3'
    );

    if (headingElements.length === 0) return;

    const containerRect = container.getBoundingClientRect();
    let currentHeading: string | null = null;

    for (const el of headingElements) {
      const rect = el.getBoundingClientRect();
      // 컨테이너 상단 기준으로 100px 이내에 있는 헤딩
      if (rect.top <= containerRect.top + 100) {
        const text = el.textContent?.trim() || "";
        const matchingItem = headings.find((h) => h.text === text);
        if (matchingItem) {
          currentHeading = matchingItem.id;
        }
      }
    }

    if (currentHeading) {
      setActiveId(currentHeading);
    } else if (headings.length > 0) {
      setActiveId(headings[0].id);
    }
  }, [headings, editorContainerRef]);

  useEffect(() => {
    const container = editorContainerRef?.current;
    if (!container) return;

    container.addEventListener("scroll", handleScroll, { passive: true });
    // 초기 위치 감지
    handleScroll();

    return () => {
      container.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll, editorContainerRef]);

  // 클릭 시 해당 헤딩으로 스크롤
  const scrollToHeading = useCallback(
    (item: TocItem) => {
      if (!editorContainerRef?.current) return;

      const container = editorContainerRef.current;
      const headingElements = container.querySelectorAll(
        '[data-content-type="heading"], h1, h2, h3'
      );

      for (const el of headingElements) {
        const text = el.textContent?.trim() || "";
        if (text === item.text) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          setActiveId(item.id);
          break;
        }
      }
    },
    [editorContainerRef]
  );

  const indentMap: Record<number, number> = { 1: 0, 2: 12, 3: 24 };

  return (
    <div
      ref={tocRef}
      className="shrink-0 hidden lg:block"
      style={{ width: isOpen ? 200 : 40 }}
    >
      {/* 토글 버튼 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1.5 rounded text-xs mb-2 hover:opacity-70 transition-opacity w-full"
        style={{ color: "var(--muted)" }}
        title={isOpen ? "목차 접기" : "목차 펼치기"}
      >
        <ListTree size={14} />
        {isOpen && (
          <>
            <span className="flex-1 text-left font-medium">목차</span>
            <ChevronDown size={12} />
          </>
        )}
        {!isOpen && <ChevronRight size={12} />}
      </button>

      {isOpen && (
        <div className="relative">
          {headings.length === 0 ? (
            <p
              className="text-xs px-2 leading-relaxed"
              style={{ color: "var(--muted)" }}
            >
              문서에 제목을 추가하면 목차가 표시됩니다
            </p>
          ) : (
            <div className="relative">
              {/* 좌측 세로 줄 */}
              <div
                className="absolute left-0 top-0 bottom-0"
                style={{
                  width: 2,
                  background: "var(--border)",
                  borderRadius: 1,
                }}
              />

              {headings.map((item, index) => {
                const isActive = activeId === item.id;
                return (
                  <div key={`${item.id}-${index}`} className="relative">
                    {/* 현재 위치 표시 점 */}
                    {isActive && (
                      <div
                        className="absolute left-0 top-1/2 -translate-y-1/2"
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "var(--primary)",
                          marginLeft: -2,
                        }}
                      />
                    )}

                    <button
                      onClick={() => scrollToHeading(item)}
                      className="block w-full text-left py-1 pr-1 rounded-r transition-colors hover:bg-black/5 dark:hover:bg-white/5 truncate"
                      style={{
                        paddingLeft: indentMap[item.level] + 12,
                        fontSize: 12,
                        lineHeight: "1.5",
                        color: isActive
                          ? "var(--primary)"
                          : item.level === 3
                            ? "var(--muted)"
                            : "var(--foreground)",
                        fontWeight: item.level === 1 ? 600 : 400,
                        background: isActive
                          ? "var(--sidebar-hover)"
                          : undefined,
                      }}
                      title={item.text}
                    >
                      {item.text}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
