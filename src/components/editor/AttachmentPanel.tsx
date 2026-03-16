"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import NextImage from "next/image";
import { Paperclip, Upload, Trash2, File, Image as ImageIcon, FileText } from "lucide-react";

interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  securityStatus?: string;
  securityDisposition?: string | null;
  securityScanner?: string | null;
  securityReviewedAt?: string | null;
  createdAt: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType.startsWith("image/")) return <ImageIcon size={16} />;
  if (mimeType === "application/pdf") return <FileText size={16} />;
  return <File size={16} />;
}

function isQuarantined(status?: string, disposition?: string | null) {
  return status === "blocked" && disposition !== "released";
}

function getSecurityBadge(status?: string, disposition?: string | null) {
  if (status === "blocked" && disposition === "released") {
    return {
      label: "수동 허용",
      background: "rgba(59,130,246,0.1)",
      color: "rgba(59,130,246,0.9)",
    };
  }
  if (status === "clean") {
    return {
      label: "검사 완료",
      background: "rgba(34,197,94,0.1)",
      color: "rgba(22,101,52,0.9)",
    };
  }
  if (status === "error") {
    return {
      label: "검사 경고",
      background: "rgba(249,115,22,0.1)",
      color: "rgba(154,52,18,0.9)",
    };
  }
  if (status === "bypassed") {
    return {
      label: "검사 생략",
      background: "rgba(107,114,128,0.1)",
      color: "rgba(107,114,128,0.9)",
    };
  }
  if (status === "blocked") {
    return {
      label: "격리됨",
      background: "rgba(239,68,68,0.1)",
      color: "rgba(153,27,27,0.9)",
    };
  }
  return null;
}

export function AttachmentPanel({
  pageId,
  workspaceId,
  readOnly = false,
}: {
  pageId: string;
  workspaceId: string;
  readOnly?: boolean;
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAttachments = useCallback(() => {
    fetch(`/api/pages/${pageId}/attachments`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setAttachments(data);
      })
      .catch(() => {});
  }, [pageId]);

  useEffect(() => {
    fetchAttachments();
  }, [fetchAttachments]);

  async function uploadFile(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("pageId", pageId);
      formData.append("workspaceId", workspaceId);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        fetchAttachments();
      } else {
        const data = await res.json();
        setUploadError(data.error || "업로드 실패");
      }
    } catch {
      setUploadError("업로드 중 오류가 발생했습니다");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(attachmentId: string) {
    if (!confirm("이 첨부파일을 삭제하시겠습니까?")) return;

    const res = await fetch(`/api/pages/${pageId}/attachments`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachmentId }),
    });

    if (res.ok) {
      setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
    }
  }

  async function handleRescan(attachmentId: string) {
    const res = await fetch(
      `/api/pages/${pageId}/attachments/${attachmentId}/rescan`,
      {
        method: "POST",
      }
    );

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "재검사 실패");
      return;
    }

    fetchAttachments();
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  const acceptTypes =
    "image/jpeg,image/png,image/gif,image/webp,image/svg+xml,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  return (
    <div
      className="px-4 md:px-8 lg:px-16 py-3 shrink-0"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-sm"
        style={{ color: "var(--muted)" }}
      >
        <Paperclip size={14} />{" "}
        {attachments.length > 0
          ? `${attachments.length}개 첨부파일`
          : "첨부파일"}
      </button>

      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Upload zone */}
          {!readOnly && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-lg cursor-pointer transition-colors"
              style={{
                border: `2px dashed ${dragOver ? "var(--primary)" : "var(--border)"}`,
                background: dragOver ? "var(--sidebar-hover)" : "transparent",
                color: "var(--muted)",
              }}
            >
              <Upload size={20} />
              <span className="text-sm">
                {uploading
                  ? "업로드 중..."
                  : "파일을 드래그하거나 클릭하여 업로드"}
              </span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                이미지, PDF, Word, Excel (최대 10MB)
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept={acceptTypes}
                onChange={handleFileInput}
                className="hidden"
              />
            </div>
          )}

          {/* Upload error */}
          {uploadError && (
            <div
              className="px-3 py-2 rounded text-sm flex items-center justify-between"
              style={{
                background: "rgba(239,68,68,0.08)",
                color: "var(--danger, #ef4444)",
                border: "1px solid rgba(239,68,68,0.18)",
              }}
            >
              <span>{uploadError}</span>
              <button
                onClick={() => setUploadError(null)}
                className="ml-2 text-xs underline opacity-70 hover:opacity-100"
              >
                닫기
              </button>
            </div>
          )}

          {/* Attachment list */}
          {attachments.length > 0 && (
            <div className="space-y-1">
              {attachments.map((att) => {
                const securityBadge = getSecurityBadge(
                  att.securityStatus,
                  att.securityDisposition
                );
                const quarantined = isQuarantined(
                  att.securityStatus,
                  att.securityDisposition
                );

                return (
                  <div
                    key={att.id}
                    className="flex items-center gap-2 p-2 rounded group hover:opacity-80"
                    style={{ background: "var(--sidebar-hover)" }}
                  >
                  {/* Thumbnail or icon */}
                  {att.mimeType.startsWith("image/") && !quarantined ? (
                    <NextImage
                      src={`/api/upload/${att.id}`}
                      alt={att.filename}
                      width={40}
                      height={40}
                      className="w-10 h-10 object-cover rounded"
                      style={{ border: "1px solid var(--border)" }}
                    />
                  ) : (
                    <div
                      className="w-10 h-10 flex items-center justify-center rounded"
                      style={{
                        background: "var(--background)",
                        color: "var(--muted)",
                      }}
                    >
                      <FileIcon mimeType={att.mimeType} />
                    </div>
                  )}

                  {/* File info */}
                  {quarantined ? (
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-sm truncate"
                        style={{ color: "var(--foreground)" }}
                      >
                        {att.filename}
                      </div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        {formatSize(att.size)}
                      </div>
                      {securityBadge && (
                        <span
                          className="inline-flex items-center mt-1 px-2 py-0.5 rounded text-[11px]"
                          style={{
                            background: securityBadge.background,
                            color: securityBadge.color,
                          }}
                        >
                          {securityBadge.label}
                          {att.securityScanner ? ` · ${att.securityScanner}` : ""}
                        </span>
                      )}
                    </div>
                  ) : (
                    <a
                      href={`/api/upload/${att.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 min-w-0"
                    >
                      <div
                        className="text-sm truncate hover:underline"
                        style={{ color: "var(--foreground)" }}
                      >
                        {att.filename}
                      </div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        {formatSize(att.size)}
                      </div>
                      {securityBadge && (
                        <span
                          className="inline-flex items-center mt-1 px-2 py-0.5 rounded text-[11px]"
                          style={{
                            background: securityBadge.background,
                            color: securityBadge.color,
                          }}
                        >
                          {securityBadge.label}
                          {att.securityScanner ? ` · ${att.securityScanner}` : ""}
                        </span>
                      )}
                    </a>
                  )}

                  {/* Copy URL button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(
                        `${window.location.origin}/api/upload/${att.id}`
                      );
                    }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ color: "var(--muted)" }}
                    title="URL 복사"
                  >
                    <Paperclip size={14} />
                  </button>

                  {!readOnly &&
                    ["error", "bypassed", "blocked", "not_scanned"].includes(
                      att.securityStatus || "not_scanned"
                    ) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRescan(att.id);
                        }}
                        className="px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                        style={{
                          color: "var(--muted)",
                          border: "1px solid var(--border)",
                        }}
                        title="보안 재검사"
                      >
                        재검사
                      </button>
                    )}

                  {!readOnly && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(att.id);
                      }}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500"
                      style={{ color: "var(--muted)" }}
                      title="삭제"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
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
