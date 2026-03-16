"use client";

import { useMemo } from "react";

interface WordCountProps {
  content: string;
}

/** 에디터 하단에 글자 수, 단어 수, 예상 읽기 시간을 표시하는 컴포넌트 */
export function WordCount({ content }: WordCountProps) {
  const stats = useMemo(() => {
    const text = content.trim();
    if (!text) {
      return { chars: 0, words: 0, readingMinutes: 0 };
    }

    const chars = text.length;

    // 단어 수: 공백으로 분리 (한국어/영어 혼합 대응)
    const words = text
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    // 평균 읽기 속도: 한국어 기준 분당 약 500자, 영어 기준 약 200단어
    // 한국어 비중이 높으므로 글자 수 기준 500자/분 사용
    const readingMinutes = Math.max(1, Math.ceil(chars / 500));

    return { chars, words, readingMinutes };
  }, [content]);

  return (
    <div
      className="flex items-center gap-4 px-4 py-2 text-xs"
      style={{ color: "var(--muted)", borderTop: "1px solid var(--border)" }}
    >
      <span>{stats.chars.toLocaleString()}자</span>
      <span>{stats.words.toLocaleString()}단어</span>
      <span>약 {stats.readingMinutes}분 읽기</span>
    </div>
  );
}
