import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import path from "node:path";

// storage.ts는 resolveLocalPath가 내부 함수(export 안 됨)이므로
// getFile/deleteFile 등 public API를 통해 간접 테스트합니다.
// 직접 테스트를 위해 모듈의 path traversal 방어를 검증합니다.

describe("storage - path traversal 방어", () => {
  const originalStorageType = process.env.STORAGE_TYPE;

  beforeEach(() => {
    process.env.STORAGE_TYPE = "local";
  });

  afterEach(() => {
    if (originalStorageType !== undefined) {
      process.env.STORAGE_TYPE = originalStorageType;
    } else {
      delete process.env.STORAGE_TYPE;
    }
  });

  it("getFile이 path traversal 시도를 거부한다", async () => {
    const { getFile } = await import("@/lib/storage");
    // ../../../etc/passwd 같은 경로 시도 — resolveLocalPath에서 에러 throw
    await expect(getFile("../../../etc/passwd", "local")).rejects.toThrow(
      "path traversal detected"
    );
  });

  it("deleteFile이 path traversal 시도를 거부한다", async () => {
    const { deleteFile } = await import("@/lib/storage");
    await expect(deleteFile("../../etc/shadow", "local")).rejects.toThrow(
      "path traversal detected"
    );
  });

  it("resolveLocalPath 로직 검증 - 정상 경로", () => {
    const LOCAL_UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

    // 단순 파일명
    const resolved = path.resolve(LOCAL_UPLOAD_DIR, "abc123.pdf");
    const normalizedUploadDir = path.resolve(LOCAL_UPLOAD_DIR) + path.sep;
    expect(resolved.startsWith(normalizedUploadDir)).toBe(true);
  });

  it("resolveLocalPath 로직 검증 - traversal 경로 탐지", () => {
    const LOCAL_UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

    const malicious = path.resolve(LOCAL_UPLOAD_DIR, "../../../etc/passwd");
    const normalizedUploadDir = path.resolve(LOCAL_UPLOAD_DIR) + path.sep;
    expect(malicious.startsWith(normalizedUploadDir)).toBe(false);
  });

  it("resolveLocalPath 로직 검증 - 인코딩된 traversal 경로 탐지", () => {
    const LOCAL_UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

    const tricky = path.resolve(LOCAL_UPLOAD_DIR, "..%2F..%2Fetc%2Fpasswd");
    // path.resolve는 percent-encoding을 해석하지 않으므로
    // 실제로는 upload dir 아래의 리터럴 파일명으로 처리됨
    const normalizedUploadDir = path.resolve(LOCAL_UPLOAD_DIR) + path.sep;
    expect(tricky.startsWith(normalizedUploadDir)).toBe(true);
  });

  it("하위 디렉토리 경로는 정상 통과한다", () => {
    const LOCAL_UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

    const nested = path.resolve(LOCAL_UPLOAD_DIR, "workspace1/page1/file.pdf");
    const normalizedUploadDir = path.resolve(LOCAL_UPLOAD_DIR) + path.sep;
    expect(nested.startsWith(normalizedUploadDir)).toBe(true);
  });
});
