"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, X, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

interface ImportModalProps {
  workspaceId: string;
  onClose: () => void;
  onImported: () => void;
}

interface FileStatus {
  name: string;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
  pageId?: string;
}

export function ImportModal({ workspaceId, onClose, onImported }: ImportModalProps) {
  const [files, setFiles] = useState<FileStatus[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [completedCount, setCompletedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((fileList: FileList | File[]) => {
    const mdFiles = Array.from(fileList).filter(
      (f) => f.name.endsWith(".md") || f.name.endsWith(".markdown")
    );
    if (mdFiles.length === 0) return;

    const newEntries: FileStatus[] = mdFiles.map((f) => ({
      name: f.name,
      status: "pending" as const,
    }));
    setFiles((prev) => [...prev, ...newEntries]);

    // Store actual file objects for later reading
    mdFiles.forEach((f) => {
      fileObjectsRef.current.set(f.name, f);
    });
  }, []);

  const fileObjectsRef = useRef<Map<string, File>>(new Map());

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        addFiles(e.target.files);
      }
    },
    [addFiles]
  );

  const removeFile = useCallback((name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name));
    fileObjectsRef.current.delete(name);
  }, []);

  async function handleImport() {
    if (files.length === 0 || importing) return;

    setImporting(true);
    setCompletedCount(0);

    for (let i = 0; i < files.length; i++) {
      const fileStatus = files[i];
      const file = fileObjectsRef.current.get(fileStatus.name);
      if (!file || fileStatus.status === "done") continue;

      // Update status to uploading
      setFiles((prev) =>
        prev.map((f) =>
          f.name === fileStatus.name ? { ...f, status: "uploading" } : f
        )
      );

      try {
        // Read file content
        const content = await file.text();

        // Derive title from filename (remove .md / .markdown extension)
        const title = fileStatus.name
          .replace(/\.(md|markdown)$/, "")
          .trim() || "제목 없음";

        // Create page
        const createRes = await fetch("/api/pages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId, title }),
        });

        if (!createRes.ok) {
          throw new Error("페이지 생성 실패");
        }

        const newPage = await createRes.json();

        // Set content
        const contentRes = await fetch(`/api/pages/${newPage.id}/content`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content }),
        });

        if (!contentRes.ok) {
          throw new Error("콘텐츠 저장 실패");
        }

        setFiles((prev) =>
          prev.map((f) =>
            f.name === fileStatus.name
              ? { ...f, status: "done", pageId: newPage.id }
              : f
          )
        );
        setCompletedCount((c) => c + 1);
      } catch (err) {
        setFiles((prev) =>
          prev.map((f) =>
            f.name === fileStatus.name
              ? {
                  ...f,
                  status: "error",
                  error: err instanceof Error ? err.message : "가져오기 실패",
                }
              : f
          )
        );
        setCompletedCount((c) => c + 1);
      }
    }

    setImporting(false);
    onImported();
    window.dispatchEvent(new Event("sidebar:refresh"));
  }

  const pendingCount = files.filter((f) => f.status === "pending" || f.status === "uploading").length;
  const totalCount = files.length;
  const allDone = totalCount > 0 && pendingCount === 0 && !importing;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !importing) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="rounded-xl shadow-2xl w-full max-w-lg mx-4"
        style={{
          background: "var(--background)",
          border: "1px solid var(--border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2 className="text-lg font-semibold">마크다운 가져오기</h2>
          <button
            onClick={onClose}
            disabled={importing}
            className="p-1 rounded hover:opacity-70"
            style={{ color: "var(--muted)" }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Drop zone */}
        <div className="px-5 py-4">
          <div
            className="rounded-lg p-8 text-center cursor-pointer transition-colors"
            style={{
              border: `2px dashed ${isDragging ? "var(--primary)" : "var(--border)"}`,
              background: isDragging ? "rgba(var(--primary-rgb, 59,130,246), 0.05)" : "var(--sidebar-bg)",
            }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload
              size={32}
              className="mx-auto mb-3"
              style={{ color: "var(--muted)" }}
            />
            <p className="text-sm font-medium mb-1">
              .md 파일을 여기에 드래그하거나 클릭하여 선택
            </p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              여러 파일을 한번에 가져올 수 있습니다
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.markdown"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="mt-4 space-y-2 max-h-60 overflow-auto">
              {/* Progress indicator */}
              {importing && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs mb-1" style={{ color: "var(--muted)" }}>
                    <span>처리 중...</span>
                    <span>{completedCount}/{totalCount} 파일</span>
                  </div>
                  <div
                    className="h-1.5 rounded-full overflow-hidden"
                    style={{ background: "var(--sidebar-hover)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        background: "var(--primary)",
                        width: `${(completedCount / totalCount) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {files.map((f) => (
                <div
                  key={f.name}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                  style={{
                    background: "var(--sidebar-bg)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <FileText size={14} style={{ color: "var(--muted)" }} className="shrink-0" />
                  <span className="flex-1 truncate">{f.name}</span>

                  {f.status === "pending" && !importing && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(f.name);
                      }}
                      className="p-0.5 rounded hover:opacity-70 shrink-0"
                      style={{ color: "var(--muted)" }}
                    >
                      <X size={14} />
                    </button>
                  )}
                  {f.status === "uploading" && (
                    <Loader2 size={14} className="shrink-0 animate-spin" style={{ color: "var(--primary)" }} />
                  )}
                  {f.status === "done" && (
                    <CheckCircle size={14} className="shrink-0" style={{ color: "#22c55e" }} />
                  )}
                  {f.status === "error" && (
                    <span className="flex items-center gap-1 shrink-0 text-xs" style={{ color: "#ef4444" }}>
                      <AlertCircle size={14} />
                      {f.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-5 py-4"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <button
            onClick={onClose}
            disabled={importing}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              background: "var(--sidebar-hover)",
              color: "var(--foreground)",
            }}
          >
            {allDone ? "닫기" : "취소"}
          </button>
          {!allDone && (
            <button
              onClick={handleImport}
              disabled={files.length === 0 || importing}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ background: "var(--primary)" }}
            >
              {importing
                ? `가져오는 중 (${completedCount}/${totalCount})`
                : `${files.length}개 파일 가져오기`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
