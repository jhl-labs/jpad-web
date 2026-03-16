"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Search,
  FileText,
  Save,
  Loader2,
} from "lucide-react";

interface BuiltInTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  content: string;
  category: string;
  isBuiltIn: true;
}

interface CustomTemplate {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  content: string;
  category: string;
  isBuiltIn: boolean;
  createdBy: { id: string; name: string };
}

type Template = BuiltInTemplate | CustomTemplate;

interface TemplatePickerModalProps {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectTemplate: (content: string, title: string) => void;
  onSelectBlank: () => void;
  currentPageContent?: string;
  currentPageTitle?: string;
}

const CATEGORIES = [
  { key: "all", label: "전체" },
  { key: "meeting", label: "회의" },
  { key: "project", label: "프로젝트" },
  { key: "journal", label: "일지" },
  { key: "custom", label: "커스텀" },
];

export function TemplatePickerModal({
  workspaceId,
  isOpen,
  onClose,
  onSelectTemplate,
  onSelectBlank,
  currentPageContent,
  currentPageTitle,
}: TemplatePickerModalProps) {
  const [builtIn, setBuiltIn] = useState<BuiltInTemplate[]>([]);
  const [custom, setCustom] = useState<CustomTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [saving, setSaving] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");
  const [saveCategory, setSaveCategory] = useState("custom");
  const [saveIcon, setSaveIcon] = useState("");

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/workspaces/${workspaceId}/templates`
      );
      if (res.ok) {
        const data = await res.json();
        setBuiltIn(data.builtIn || []);
        setCustom(data.custom || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
      setSearch("");
      setCategory("all");
      setShowSaveForm(false);
    }
  }, [isOpen, fetchTemplates]);

  useEffect(() => {
    if (!isOpen) return;
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const allTemplates: Template[] = [...builtIn, ...custom];

  const filtered = allTemplates.filter((t) => {
    if (category !== "all" && t.category !== category) return false;
    if (search) {
      const q = search.toLowerCase();
      const name = t.name.toLowerCase();
      const desc = (t.description || "").toLowerCase();
      if (!name.includes(q) && !desc.includes(q)) return false;
    }
    return true;
  });

  async function handleSaveAsTemplate() {
    if (!saveName.trim() || !currentPageContent) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: saveName.trim(),
          description: saveDescription.trim() || undefined,
          icon: saveIcon.trim() || undefined,
          content: currentPageContent,
          category: saveCategory,
        }),
      });
      if (res.ok) {
        setShowSaveForm(false);
        setSaveName("");
        setSaveDescription("");
        setSaveIcon("");
        fetchTemplates();
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  }

  function handleSelect(template: Template) {
    const title = template.name;
    onSelectTemplate(template.content, title);
    onClose();
  }

  function handleBlank() {
    onSelectBlank();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        style={{ background: "var(--background)", border: "1px solid var(--border)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2 className="text-lg font-semibold">새 페이지 만들기</h2>
          <button onClick={onClose} className="p-1 rounded hover:opacity-70">
            <X size={18} />
          </button>
        </div>

        {/* Search + Categories */}
        <div className="px-5 pt-4 pb-2 space-y-3">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ border: "1px solid var(--border)", background: "var(--sidebar-bg)" }}
          >
            <Search size={16} style={{ color: "var(--muted)" }} />
            <input
              type="text"
              placeholder="템플릿 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm"
            />
          </div>

          <div className="flex gap-1 flex-wrap">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setCategory(cat.key)}
                className="px-3 py-1 rounded-full text-xs font-medium transition-colors"
                style={{
                  background:
                    category === cat.key ? "var(--primary)" : "var(--sidebar-bg)",
                  color:
                    category === cat.key ? "white" : "var(--foreground)",
                  border: `1px solid ${category === cat.key ? "var(--primary)" : "var(--border)"}`,
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-5 pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={24} className="animate-spin" style={{ color: "var(--muted)" }} />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
              {/* Blank page option */}
              <button
                onClick={handleBlank}
                className="flex flex-col items-center gap-2 p-4 rounded-lg text-center transition-all hover:scale-[1.02]"
                style={{
                  border: "2px dashed var(--border)",
                  background: "var(--sidebar-bg)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--primary)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ background: "var(--background)" }}
                >
                  <FileText size={20} style={{ color: "var(--muted)" }} />
                </div>
                <span className="text-sm font-medium">빈 페이지</span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  빈 페이지에서 시작
                </span>
              </button>

              {/* Templates */}
              {filtered.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleSelect(template)}
                  className="flex flex-col items-center gap-2 p-4 rounded-lg text-center transition-all hover:scale-[1.02]"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--sidebar-bg)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--primary)";
                    e.currentTarget.style.background = "var(--background)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.background = "var(--sidebar-bg)";
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                    style={{ background: "var(--background)" }}
                  >
                    {template.icon || "\ud83d\udcc4"}
                  </div>
                  <span className="text-sm font-medium">{template.name}</span>
                  <span
                    className="text-xs line-clamp-2"
                    style={{ color: "var(--muted)" }}
                  >
                    {template.description || ""}
                  </span>
                  {!template.isBuiltIn && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ background: "var(--background)", color: "var(--muted)" }}
                    >
                      커스텀
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {!loading && filtered.length === 0 && search && (
            <p className="text-sm text-center py-8" style={{ color: "var(--muted)" }}>
              &quot;{search}&quot;에 대한 검색 결과가 없습니다
            </p>
          )}
        </div>

        {/* Footer: Save as template */}
        <div
          className="px-5 py-3"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          {showSaveForm ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="아이콘 (이모지)"
                  value={saveIcon}
                  onChange={(e) => setSaveIcon(e.target.value)}
                  className="w-16 px-2 py-1.5 rounded text-sm bg-transparent outline-none"
                  style={{ border: "1px solid var(--border)" }}
                />
                <input
                  type="text"
                  placeholder="템플릿 이름 *"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  className="flex-1 px-2 py-1.5 rounded text-sm bg-transparent outline-none"
                  style={{ border: "1px solid var(--border)" }}
                  autoFocus
                />
                <select
                  value={saveCategory}
                  onChange={(e) => setSaveCategory(e.target.value)}
                  className="px-2 py-1.5 rounded text-sm bg-transparent outline-none"
                  style={{ border: "1px solid var(--border)" }}
                >
                  <option value="meeting">회의</option>
                  <option value="project">프로젝트</option>
                  <option value="journal">일지</option>
                  <option value="custom">커스텀</option>
                </select>
              </div>
              <input
                type="text"
                placeholder="설명 (선택)"
                value={saveDescription}
                onChange={(e) => setSaveDescription(e.target.value)}
                className="w-full px-2 py-1.5 rounded text-sm bg-transparent outline-none"
                style={{ border: "1px solid var(--border)" }}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowSaveForm(false)}
                  className="px-3 py-1.5 rounded text-sm"
                  style={{ color: "var(--muted)" }}
                >
                  취소
                </button>
                <button
                  onClick={handleSaveAsTemplate}
                  disabled={!saveName.trim() || saving}
                  className="px-3 py-1.5 rounded text-sm font-medium text-white disabled:opacity-50"
                  style={{ background: "var(--primary)" }}
                >
                  {saving ? "저장 중..." : "저장"}
                </button>
              </div>
            </div>
          ) : (
            currentPageContent && (
              <button
                onClick={() => {
                  setShowSaveForm(true);
                  setSaveName(currentPageTitle || "");
                }}
                className="flex items-center gap-2 text-sm hover:opacity-70"
                style={{ color: "var(--primary)" }}
              >
                <Save size={14} />
                현재 페이지를 템플릿으로 저장
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
