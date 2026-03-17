"use client";

import Link from "next/link";

interface AppLogoProps {
  href?: string;
  className?: string;
  compact?: boolean;
}

export function AppLogo({
  href = "/workspace",
  className = "",
  compact = false,
}: AppLogoProps) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 rounded-md ${className}`.trim()}
      aria-label="jpad 홈으로 이동"
    >
      <span
        className="flex h-7 w-7 items-center justify-center rounded-md text-sm font-semibold text-white"
        style={{ background: "var(--primary)" }}
      >
        j
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-sm font-semibold lowercase tracking-[0.18em]">
            jpad
          </span>
          <span className="text-[8px] tracking-wider" style={{ color: "var(--muted)", opacity: 0.6 }}>
            v{process.env.NEXT_PUBLIC_APP_VERSION || "1.0.0"}
          </span>
        </span>
      )}
    </Link>
  );
}
