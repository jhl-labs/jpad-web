"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";

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

/** Emoji search keywords mapping (Korean + English) */
const EMOJI_KEYWORDS: Record<string, string[]> = {
  "😀": ["웃음", "기쁨", "smile", "happy", "grin"],
  "😂": ["눈물", "웃음", "laugh", "cry", "joy"],
  "🥰": ["사랑", "하트", "love", "heart"],
  "😎": ["멋짐", "선글라스", "cool", "sunglasses"],
  "🤔": ["생각", "고민", "think", "wonder"],
  "😢": ["슬픔", "울음", "sad", "cry"],
  "😡": ["화남", "분노", "angry", "mad"],
  "🥳": ["축하", "파티", "party", "celebrate"],
  "😴": ["잠", "졸림", "sleep", "tired"],
  "🤗": ["포옹", "안아", "hug", "embrace"],
  "😱": ["놀람", "충격", "shock", "surprise", "scared"],
  "🤩": ["감탄", "별", "star", "excited", "amazing"],
  "😇": ["천사", "착한", "angel", "innocent"],
  "🫠": ["녹음", "melt", "melting"],
  "🐶": ["강아지", "개", "dog", "puppy"],
  "🐱": ["고양이", "cat", "kitty"],
  "🐻": ["곰", "bear"],
  "🐼": ["팬더", "panda"],
  "🐨": ["코알라", "koala"],
  "🦊": ["여우", "fox"],
  "🐸": ["개구리", "frog"],
  "🐵": ["원숭이", "monkey"],
  "🐧": ["펭귄", "penguin"],
  "🦋": ["나비", "butterfly"],
  "🐢": ["거북이", "turtle"],
  "🐬": ["돌고래", "dolphin"],
  "🦄": ["유니콘", "unicorn"],
  "🍎": ["사과", "apple", "fruit"],
  "🍕": ["피자", "pizza"],
  "🍔": ["햄버거", "burger"],
  "🍣": ["초밥", "스시", "sushi"],
  "🍩": ["도넛", "donut"],
  "🍰": ["케이크", "cake"],
  "☕": ["커피", "coffee", "카페"],
  "🍺": ["맥주", "beer"],
  "🥗": ["샐러드", "salad"],
  "🍜": ["라면", "국수", "noodle", "ramen"],
  "🌮": ["타코", "taco"],
  "🧁": ["컵케이크", "cupcake"],
  "🍿": ["팝콘", "popcorn"],
  "⚽": ["축구", "soccer", "football"],
  "🏀": ["농구", "basketball"],
  "🎮": ["게임", "game", "controller"],
  "🎨": ["그림", "미술", "art", "paint"],
  "🎵": ["음악", "노래", "music", "note"],
  "🏃": ["달리기", "run", "running"],
  "🚴": ["자전거", "bike", "cycling"],
  "🧘": ["요가", "명상", "yoga", "meditation"],
  "🎯": ["목표", "target", "dart"],
  "🏆": ["트로피", "우승", "trophy", "winner"],
  "🎲": ["주사위", "dice", "game"],
  "🎭": ["연극", "가면", "theater", "mask"],
  "🎪": ["서커스", "circus", "tent"],
  "✈️": ["비행기", "여행", "airplane", "travel"],
  "🚗": ["자동차", "car", "drive"],
  "🏠": ["집", "house", "home"],
  "🏔️": ["산", "mountain"],
  "🌊": ["바다", "파도", "wave", "ocean", "sea"],
  "🌅": ["일출", "sunset", "sunrise"],
  "🗼": ["타워", "tower"],
  "🏖️": ["해변", "beach"],
  "🌍": ["지구", "세계", "earth", "world", "globe"],
  "🚀": ["로켓", "우주", "rocket", "space"],
  "⛺": ["캠핑", "텐트", "camp", "tent"],
  "🗺️": ["지도", "map"],
  "🌋": ["화산", "volcano"],
  "💻": ["컴퓨터", "노트북", "computer", "laptop"],
  "📱": ["핸드폰", "스마트폰", "phone", "mobile"],
  "📚": ["책", "도서", "book", "study"],
  "💡": ["아이디어", "전구", "idea", "light", "bulb"],
  "🔑": ["열쇠", "key"],
  "📷": ["카메라", "사진", "camera", "photo"],
  "🎁": ["선물", "gift", "present"],
  "💰": ["돈", "money", "dollar"],
  "⏰": ["시계", "알람", "clock", "alarm", "time"],
  "🔔": ["벨", "알림", "bell", "notification"],
  "📌": ["핀", "고정", "pin"],
  "✏️": ["연필", "pencil", "write"],
  "🗂️": ["폴더", "파일", "folder", "file"],
  "❤️": ["하트", "사랑", "heart", "love", "red"],
  "⭐": ["별", "star"],
  "✅": ["체크", "완료", "check", "done", "complete"],
  "❌": ["엑스", "취소", "cancel", "wrong", "no"],
  "⚡": ["번개", "전기", "lightning", "electric", "bolt"],
  "🔥": ["불", "핫", "fire", "hot", "flame"],
  "💎": ["다이아", "보석", "diamond", "gem"],
  "♻️": ["재활용", "recycle"],
  "🚫": ["금지", "prohibit", "no", "ban"],
  "💯": ["백점", "완벽", "hundred", "perfect"],
  "🏳️": ["깃발", "flag", "white"],
  "⚠️": ["경고", "주의", "warning", "caution"],
};

const ALL_EMOJIS = Object.values(EMOJI_CATEGORIES).flat();

interface EmojiPickerProps {
  onSelect: (emoji: string | null) => void;
  onClose: () => void;
}

export function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
  const [activeCategory, setActiveCategory] = useState(CATEGORY_NAMES[0]);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredEmojis = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    return ALL_EMOJIS.filter((emoji) => {
      const keywords = EMOJI_KEYWORDS[emoji];
      if (!keywords) return false;
      return keywords.some((kw) => kw.includes(q));
    });
  }, [searchQuery]);

  const isSearching = searchQuery.trim().length > 0;
  const emojis = isSearching ? (filteredEmojis ?? []) : EMOJI_CATEGORIES[activeCategory];

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
      {/* Search input */}
      <div className="px-2 pt-2">
        <input
          ref={searchRef}
          type="text"
          placeholder="이모지 검색..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setFocusedIndex(0);
          }}
          className="w-full text-sm rounded px-2 py-1.5 outline-none"
          style={{
            background: "var(--sidebar-bg)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
          }}
        />
      </div>

      {/* Category tabs (hidden during search) */}
      {!isSearching && (
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
      )}

      {/* Emoji grid */}
      <div
        ref={gridRef}
        role="grid"
        aria-label={isSearching ? "검색 결과" : activeCategory}
        className="grid grid-cols-7 gap-1 p-2"
        onKeyDown={handleGridKeyDown}
      >
        {isSearching && emojis.length === 0 && (
          <div
            className="col-span-7 text-center py-4 text-xs"
            style={{ color: "var(--muted)" }}
          >
            검색 결과가 없습니다
          </div>
        )}
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
