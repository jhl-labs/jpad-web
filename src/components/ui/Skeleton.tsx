"use client";
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded ${className}`} style={{ background: "var(--sidebar-hover)" }} />;
}
