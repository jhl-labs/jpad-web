"use client";

import { useState, useRef, useEffect, useCallback } from "react";

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
  const [focusedIndex, setFocusedIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const emojis = EMOJI_CATEGORIES[activeCategory];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  // Reset focus index when category changes
  useEffect(() => {
    setFocusedIndex(0);
  }, [activeCategory]);

  const handleGridKeyDown = useCallback((e: React.KeyboardEvent) => {
    const cols = 7;
    let next = focusedIndex;

    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        next = focusedIndex + 1 < emojis.length ? focusedIndex + 1 : focusedIndex;
        break;
      case "ArrowLeft":
        e.preventDefault();
        next = focusedIndex - 1 >= 0 ? focusedIndex - 1 : focusedIndex;
        break;
      case "ArrowDown":
        e.preventDefault();
        next = focusedIndex + cols < emojis.length ? focusedIndex + cols : focusedIndex;
        break;
      case "ArrowUp":
        e.preventDefault();
        next = focusedIndex - cols >= 0 ? focusedIndex - cols : focusedIndex;
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        onSelect(emojis[focusedIndex]);
        onClose();
        return;
      default:
        return;
    }

    setFocusedIndex(next);
    const grid = gridRef.current;
    if (grid) {
      const buttons = grid.querySelectorAll<HTMLButtonElement>('[role="gridcell"] button, [role="gridcell"]');
      buttons[next]?.focus();
    }
  }, [focusedIndex, emojis, onSelect, onClose]);

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
      <div
        ref={gridRef}
        role="grid"
        aria-label={activeCategory}
        className="grid grid-cols-7 gap-1 p-2"
        onKeyDown={handleGridKeyDown}
      >
        {emojis.map((emoji, index) => (
          <div key={emoji} role="gridcell">
            <button
              onClick={() => { onSelect(emoji); onClose(); }}
              tabIndex={index === focusedIndex ? 0 : -1}
              aria-label={emoji}
              className="flex items-center justify-center w-9 h-9 rounded text-xl hover:scale-110 transition-transform"
              style={{ background: "transparent" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sidebar-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              onFocus={() => setFocusedIndex(index)}
            >
              {emoji}
            </button>
          </div>
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
