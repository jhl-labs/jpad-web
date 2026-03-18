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

    // 한국어 문자 수 (CJK Unified Ideographs + Hangul)
    const koreanChars = (text.match(/[\uAC00-\uD7AF\u3130-\u318F\u1100-\u11FF]/g) || []).length;
    const englishWords = text
      .replace(/[\uAC00-\uD7AF\u3130-\u318F\u1100-\u11FF]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 0).length;

    // 한국어: 500자/분, 영어: 200단어/분
    const koreanMinutes = koreanChars / 500;
    const englishMinutes = englishWords / 200;
    const readingMinutes = Math.max(1, Math.ceil(koreanMinutes + englishMinutes));

    return { chars, words, readingMinutes };
  }, [content]);

  return (
    <div
      className="flex items-center px-4 py-2 text-xs"
      style={{ color: "var(--muted)", borderTop: "1px solid var(--border)" }}
    >
      <span>
        {stats.chars.toLocaleString()}자 &middot; {stats.words.toLocaleString()}단어 &middot; 약 {stats.readingMinutes}분
      </span>
    </div>
  );
}
