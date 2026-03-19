"use client";

import { useState, useEffect, useCallback } from "react";
import { formatBacklink } from "@/lib/backlinks";

interface PageSuggestion {
  id: string;
  title: string;
  slug: string;
  icon: string | null;
}

interface BacklinkSuggestionProps {
  workspaceId: string;
  editorElement: HTMLElement | null;
  onInsert: (markup: string) => void;
}

export function BacklinkSuggestion({
  workspaceId,
  editorElement,
  onInsert,
}: BacklinkSuggestionProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<PageSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  // Detect [[ typing - listen on the actual editable elements inside BlockNote
  useEffect(() => {
    if (!editorElement) return;

    const handleInput = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;

      const range = selection.getRangeAt(0);
      const textNode = range.startContainer;
      if (textNode.nodeType !== Node.TEXT_NODE) return;

      // Verify the text node is inside our editor container
      if (!editorElement.contains(textNode)) return;

      const text = textNode.textContent || "";
      const cursorPos = range.startOffset;

      // Find [[ before cursor
      const beforeCursor = text.slice(0, cursorPos);
      const bracketIdx = beforeCursor.lastIndexOf("[[");

      if (bracketIdx !== -1 && !beforeCursor.slice(bracketIdx).includes("]]")) {
        const q = beforeCursor.slice(bracketIdx + 2);
        setQuery(q);
        setOpen(true);
        setSelectedIndex(0);

        // Position the menu using caret position
        const caretRange = document.createRange();
        caretRange.setStart(textNode, cursorPos);
        caretRange.setEnd(textNode, cursorPos);
        const rect = caretRange.getBoundingClientRect();
        let top = rect.bottom + 4;
        let left = rect.left;
        // 하단 경계 검사 (메뉴 높이 약 200px)
        if (top + 200 > window.innerHeight) {
          top = rect.top - 200;
        }
        // 우측 경계 검사 (메뉴 너비 약 200px)
        if (left + 200 > window.innerWidth) {
          left = window.innerWidth - 210;
        }
        setPosition({ top, left });
      } else {
        setOpen(false);
      }
    };

    // Use document-level listener to catch events from BlockNote's contenteditable
    const handleDocInput = (e: Event) => {
      if (editorElement.contains(e.target as Node)) {
        handleInput();
      }
    };

    const handleDocKeyup = (e: Event) => {
      const key = (e as KeyboardEvent).key;
      if (key === "ArrowDown" || key === "ArrowUp" || key === "Enter" || key === "Escape") return;
      handleDocInput(e);
    };

    document.addEventListener("input", handleDocInput, true);
    document.addEventListener("keyup", handleDocKeyup, true);

    return () => {
      document.removeEventListener("input", handleDocInput, true);
      document.removeEventListener("keyup", handleDocKeyup, true);
    };
  }, [editorElement]);

  // Fetch suggestions
  useEffect(() => {
    if (!open) return;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/pages/search?workspaceId=${workspaceId}&q=${encodeURIComponent(query)}`
        );
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data : data.results ?? []);
      } catch (error) {
        console.error("[BacklinkSuggestion] search failed:", error);
        setSuggestions([]);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [open, query, workspaceId]);

  const insertSuggestion = useCallback((suggestion: PageSuggestion) => {
    const markup = formatBacklink(suggestion.slug, suggestion.title);
    setOpen(false);

    // Dispatch custom event for InnerEditor to handle via ProseMirror transaction
    editorElement?.dispatchEvent(
      new CustomEvent("backlink:insert", {
        detail: { markup },
        bubbles: true,
      })
    );

    onInsert(markup);
  }, [editorElement, onInsert]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!open) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && suggestions[selectedIndex]) {
        e.preventDefault();
        insertSuggestion(suggestions[selectedIndex]);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    },
    [open, suggestions, selectedIndex, insertSuggestion]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [handleKeyDown]);

  if (!open || suggestions.length === 0) return null;

  return (
    <div
      className="fixed z-[60] rounded-lg shadow-lg py-1 max-h-48 overflow-auto"
      role="listbox"
      style={{
        top: position.top,
        left: position.left,
        background: "var(--background)",
        border: "1px solid var(--border)",
        minWidth: 200,
      }}
    >
      {suggestions.map((s, i) => (
        <button
          key={s.id}
          role="option"
          aria-selected={i === selectedIndex}
          className="w-full text-left px-3 py-1.5 text-sm flex items-center gap-2"
          style={{
            background: i === selectedIndex ? "var(--sidebar-hover)" : undefined,
          }}
          onMouseEnter={() => setSelectedIndex(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            insertSuggestion(s);
          }}
        >
          <span style={{ color: "var(--muted)" }}>{s.icon || "📄"}</span>
          {s.title}
        </button>
      ))}
    </div>
  );
}
