"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { X, MessageCircle, Send, Reply, Trash2, CheckCircle } from "lucide-react";

interface CommentUser {
  id: string;
  name: string;
  email: string;
}

interface Comment {
  id: string;
  content: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
  pageId: string;
  userId: string;
  parentId: string | null;
  user: CommentUser;
  replies?: Comment[];
}

function relativeTime(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}일 전`;
  return date.toLocaleDateString("ko");
}

function getAvatarColor(name: string): string {
  const colors = [
    "#e57373", "#f06292", "#ba68c8", "#9575cd",
    "#7986cb", "#64b5f6", "#4fc3f7", "#4dd0e1",
    "#4db6ac", "#81c784", "#aed581", "#ff8a65",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function Avatar({ name }: { name: string }) {
  return (
    <div
      className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
      style={{ background: getAvatarColor(name) }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function CommentItem({
  comment,
  currentUserId,
  pageId,
  onRefresh,
  isReply,
  readOnly = false,
}: {
  comment: Comment;
  currentUserId: string | undefined;
  pageId: string;
  onRefresh: () => void;
  isReply?: boolean;
  readOnly?: boolean;
}) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isAuthor = currentUserId === comment.userId;

  async function handleReply() {
    if (!replyContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/pages/${pageId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyContent.trim(), parentId: comment.id }),
      });
      if (res.ok) {
        setReplyContent("");
        setShowReplyForm(false);
        onRefresh();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirm("이 댓글을 삭제하시겠습니까?")) return;
    const res = await fetch(`/api/pages/${pageId}/comments/${comment.id}`, {
      method: "DELETE",
    });
    if (res.ok) onRefresh();
  }

  async function handleToggleResolved() {
    const res = await fetch(`/api/pages/${pageId}/comments/${comment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: !comment.resolved }),
    });
    if (res.ok) onRefresh();
  }

  return (
    <div
      className={isReply ? "ml-8 mt-2" : ""}
      style={{ opacity: comment.resolved ? 0.5 : 1 }}
    >
      <div
        className="p-3 rounded-lg mb-1"
        style={{ background: "var(--sidebar-bg)" }}
      >
        <div className="flex items-start gap-2">
          <Avatar name={comment.user.name} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{comment.user.name}</span>
              <span className="text-xs shrink-0" style={{ color: "var(--muted)" }}>
                {relativeTime(new Date(comment.createdAt))}
              </span>
            </div>
            <p
              className="text-sm mt-1 whitespace-pre-wrap break-words"
              style={{
                textDecoration: comment.resolved ? "line-through" : undefined,
              }}
            >
              {comment.content}
            </p>
            <div className="flex items-center gap-2 mt-2">
              {!isReply && !readOnly && (
                <button
                  onClick={() => setShowReplyForm(!showReplyForm)}
                  className="flex items-center gap-1 text-xs hover:opacity-70"
                  style={{ color: "var(--muted)" }}
                >
                  <Reply size={12} /> 답글
                </button>
              )}
              {!isReply && !readOnly && (
                <button
                  onClick={handleToggleResolved}
                  className="flex items-center gap-1 text-xs hover:opacity-70"
                  style={{ color: comment.resolved ? "var(--primary)" : "var(--muted)" }}
                >
                  <CheckCircle size={12} /> {comment.resolved ? "해결됨" : "해결"}
                </button>
              )}
              {isAuthor && !readOnly && (
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-1 text-xs hover:opacity-70"
                  style={{ color: "var(--muted)" }}
                >
                  <Trash2 size={12} /> 삭제
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Replies */}
      {comment.replies?.map((reply) => (
        <CommentItem
          key={reply.id}
          comment={reply}
          currentUserId={currentUserId}
          pageId={pageId}
          onRefresh={onRefresh}
          isReply
          readOnly={readOnly}
        />
      ))}

      {/* Reply form */}
      {showReplyForm && !readOnly && (
        <div className="ml-8 mt-2 flex gap-2">
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="답글 작성..."
            rows={2}
            className="flex-1 text-sm p-2 rounded resize-none outline-none"
            style={{
              background: "var(--sidebar-bg)",
              border: "1px solid var(--border)",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleReply();
              }
            }}
          />
          <button
            onClick={handleReply}
            disabled={!replyContent.trim() || submitting}
            className="self-end p-2 rounded hover:opacity-70 disabled:opacity-30"
            style={{ color: "var(--primary)" }}
          >
            <Send size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

export function CommentPanel({
  pageId,
  onClose,
  readOnly = false,
}: {
  pageId: string;
  onClose: () => void;
  readOnly?: boolean;
}) {
  const { data: session } = useSession();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newContent, setNewContent] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const currentUserId = (session?.user as { id?: string } | undefined)?.id;

  const fetchComments = useCallback(async () => {
    const res = await fetch(`/api/pages/${pageId}/comments`);
    if (res.ok) {
      const data = await res.json();
      setComments(data);
    }
  }, [pageId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  async function handleSubmit() {
    if (!newContent.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/pages/${pageId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent.trim() }),
      });
      if (res.ok) {
        setNewContent("");
        fetchComments();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const totalCount = comments.reduce(
    (sum, c) => sum + 1 + (c.replies?.length || 0),
    0
  );

  return (
    <div
      role="dialog"
      aria-label="댓글"
      aria-modal="true"
      className="fixed right-0 top-0 h-full w-full md:w-80 max-w-full shadow-lg z-50 flex flex-col"
      style={{ background: "var(--background)", borderLeft: "1px solid var(--border)" }}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-3"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <MessageCircle size={16} />
          <h3 className="font-semibold text-sm">댓글</h3>
          {totalCount > 0 && (
            <span
              className="text-xs px-1.5 py-0.5 rounded-full"
              style={{ background: "var(--sidebar-hover)", color: "var(--muted)" }}
            >
              {totalCount}
            </span>
          )}
        </div>
        <button onClick={onClose} className="p-1 rounded hover:opacity-70">
          <X size={16} />
        </button>
      </div>

      {!readOnly && (
        <div className="p-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="댓글 작성..."
            rows={3}
            className="w-full text-sm p-2 rounded resize-none outline-none"
            style={{
              background: "var(--sidebar-bg)",
              border: "1px solid var(--border)",
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSubmit();
              }
            }}
          />
          <button
            onClick={handleSubmit}
            disabled={!newContent.trim() || submitting}
            className="mt-2 w-full py-1.5 rounded text-white text-sm disabled:opacity-50"
            style={{ background: "var(--primary)" }}
          >
            댓글 작성
          </button>
        </div>
      )}

      {/* Comment list */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            currentUserId={currentUserId}
            pageId={pageId}
            onRefresh={fetchComments}
            readOnly={readOnly}
          />
        ))}
        {comments.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2" style={{ color: "var(--muted)" }}>
            <MessageCircle size={32} strokeWidth={1.5} />
            <p className="text-sm">첫 댓글을 남겨보세요</p>
          </div>
        )}
      </div>
    </div>
  );
}
