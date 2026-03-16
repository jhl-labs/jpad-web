"use client";

export default function OfflinePage() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "2rem",
        fontFamily: "var(--font-sans, system-ui, sans-serif)",
        backgroundColor: "var(--background, #ffffff)",
        color: "var(--foreground, #111827)",
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          marginBottom: "1.5rem",
          borderRadius: "50%",
          backgroundColor: "var(--muted, #f3f4f6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "2rem",
        }}
      >
        ⚡
      </div>
      <h1
        style={{
          fontSize: "1.5rem",
          fontWeight: 700,
          marginBottom: "0.75rem",
        }}
      >
        인터넷에 연결되어 있지 않습니다
      </h1>
      <p
        style={{
          color: "var(--muted-foreground, #6b7280)",
          marginBottom: "2rem",
          textAlign: "center",
          maxWidth: 400,
        }}
      >
        네트워크 연결을 확인한 후 다시 시도해 주세요.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: "0.625rem 1.5rem",
          backgroundColor: "var(--primary, #2563eb)",
          color: "#ffffff",
          border: "none",
          borderRadius: "0.5rem",
          fontSize: "0.9375rem",
          fontWeight: 500,
          cursor: "pointer",
        }}
      >
        다시 시도
      </button>
    </div>
  );
}
