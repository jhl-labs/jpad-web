import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h1 className="text-6xl font-bold mb-4" style={{ color: "var(--primary)" }}>
          404
        </h1>
        <p className="text-lg font-semibold mb-2">페이지를 찾을 수 없습니다</p>
        <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>
          요청하신 페이지가 존재하지 않거나 이동되었습니다.
        </p>
        <Link
          href="/workspace"
          className="inline-block px-6 py-2.5 rounded text-sm text-white"
          style={{ background: "var(--primary)" }}
        >
          워크스페이스로 돌아가기
        </Link>
      </div>
    </div>
  );
}
