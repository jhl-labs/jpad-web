"use client";

import { useState, useRef, useEffect } from "react";

const GRADIENT_OPTIONS = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
  "linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)",
  "linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)",
];

interface CoverPickerProps {
  pageId: string;
  workspaceId: string;
  onSelect: (coverImage: string | null) => void;
  onClose: () => void;
}

export function CoverPicker({ pageId, workspaceId, onSelect, onClose }: CoverPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  async function handleFileUpload(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("pageId", pageId);
      formData.append("workspaceId", workspaceId);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        onSelect(data.url);
        onClose();
      }
    } catch (_error) {
      // ignore
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="커버 이미지 선택"
      aria-modal="true"
      className="absolute z-50 rounded-lg shadow-lg"
      style={{
        background: "var(--background)",
        border: "1px solid var(--border)",
        width: 300,
      }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      <div className="p-3">
        <p className="text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
          그라디언트
        </p>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {GRADIENT_OPTIONS.map((gradient, index) => (
            <button
              key={gradient}
              onClick={() => { onSelect(gradient); onClose(); }}
              aria-label={`그라디언트 ${index + 1}`}
              className="h-10 rounded-md hover:ring-2 hover:ring-offset-1 transition-all"
              style={{
                background: gradient,
              }}
            />
          ))}
        </div>

        <p className="text-xs font-medium mb-2" style={{ color: "var(--muted)" }}>
          이미지 업로드
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileUpload(file);
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-full text-sm py-2 rounded"
          style={{
            color: "var(--foreground)",
            border: "1px solid var(--border)",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sidebar-hover)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {uploading ? "업로드 중..." : "이미지 선택"}
        </button>
      </div>

      {/* Remove button */}
      <div className="px-3 pb-3">
        <button
          onClick={() => { onSelect(null); onClose(); }}
          className="w-full text-sm py-1.5 rounded mt-1"
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
