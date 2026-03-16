import React from "react";

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-xl p-5"
      style={{ border: "1px solid var(--border)", background: "var(--background)" }}
    >
      <div className="mb-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && (
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium" style={{ color: "var(--muted)" }}>
        {label}
      </div>
      {children}
    </label>
  );
}
