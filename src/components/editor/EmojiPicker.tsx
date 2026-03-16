"use client";

import { useState, useRef, useEffect } from "react";

const EMOJI_CATEGORIES: Record<string, string[]> = {
  "표정": ["😀", "😂", "🥰", "😎", "🤔", "😢", "😡", "🥳", "😴", "🤗", "😱", "🤩", "😇", "🫠"],
  "동물": ["🐶", "🐱", "🐻", "🐼", "🐨", "🦊", "🐸", "🐵", "🐧", "🦋", "🐢", "🐬", "🦄"],
  "음식": ["🍎", "🍕", "🍔", "🍣", "🍩", "🍰", "☕", "🍺", "🥗", "🍜", "🌮", "🧁", "🍿"],
  "활동": ["⚽", "🏀", "🎮", "🎨", "🎵", "🏃", "🚴", "🧘", "🎯", "🏆", "🎲", "🎭", "🎪"],
  "여행": ["✈️", "🚗", "🏠", "🏔️", "🌊", "🌅", "🗼", "🏖️", "🌍", "🚀", "⛺", "🗺️", "🌋"],
  "사물": ["💻", "📱", "📚", "💡", "🔑", "📷", "🎁", "💰", "⏰", "🔔", "📌", "✏️", "🗂️"],
  "기호": ["❤️", "⭐", "✅", "❌", "⚡", "🔥", "💎", "🎯", "♻️", "🚫", "💯", "🏳️", "⚠️"],
};

const CATEGORY_NAMES = Object.keys(EMOJI_CATEGORIES);

interface EmojiPickerProps {
  onSelect: (emoji: string | null) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState(CATEGORY_NAMES[0]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="이모지 선택"
      aria-modal="true"
      className="absolute z-50 rounded-lg shadow-lg"
      style={{
        background: "var(--background)",
        border: "1px solid var(--border)",
        width: 320,
      }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      {/* Category tabs */}
      <div
        className="flex gap-1 px-2 pt-2 pb-1 overflow-x-auto text-xs"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        {CATEGORY_NAMES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className="px-2 py-1 rounded whitespace-nowrap"
            style={{
              background: activeCategory === cat ? "var(--sidebar-hover)" : "transparent",
              color: activeCategory === cat ? "var(--foreground)" : "var(--muted)",
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Emoji grid */}
      <div className="grid grid-cols-7 gap-1 p-2">
        {EMOJI_CATEGORIES[activeCategory].map((emoji) => (
          <button
            key={emoji}
            onClick={() => { onSelect(emoji); onClose(); }}
            className="flex items-center justify-center w-9 h-9 rounded text-xl hover:scale-110 transition-transform"
            style={{ background: "transparent" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sidebar-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Remove button */}
      <div className="px-2 pb-2">
        <button
          onClick={() => { onSelect(null); onClose(); }}
          className="w-full text-sm py-1.5 rounded"
          style={{
            color: "var(--muted)",
            border: "1px solid var(--border)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sidebar-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          제거
        </button>
      </div>
    </div>
  );
}
