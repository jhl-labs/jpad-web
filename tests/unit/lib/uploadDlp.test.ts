import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { evaluateUploadDlp } from "@/lib/uploadDlp";

describe("uploadDlp", () => {
  const originalMode = process.env.UPLOAD_DLP_SCAN_MODE;
  const originalDetectors = process.env.UPLOAD_DLP_DETECTORS;

  beforeEach(() => {
    process.env.UPLOAD_DLP_SCAN_MODE = "required";
    delete process.env.UPLOAD_DLP_DETECTORS;
  });

  afterEach(() => {
    if (originalMode !== undefined) {
      process.env.UPLOAD_DLP_SCAN_MODE = originalMode;
    } else {
      delete process.env.UPLOAD_DLP_SCAN_MODE;
    }
    if (originalDetectors !== undefined) {
      process.env.UPLOAD_DLP_DETECTORS = originalDetectors;
    } else {
      delete process.env.UPLOAD_DLP_DETECTORS;
    }
  });

  function makeTextBuffer(text: string): Buffer {
    // SVG 형태로 감싸서 텍스트 추출이 가능하게 함
    return Buffer.from(`<svg><text>${text}</text></svg>`, "utf8");
  }

  it("신용카드 번호를 탐지한다 (Luhn 체크 포함)", async () => {
    // 4111111111111111 은 유효한 Luhn 번호 (Visa 테스트 카드)
    const buffer = makeTextBuffer("My card is 4111111111111111");
    const result = await evaluateUploadDlp("test.svg", "image/svg+xml", buffer);
    expect(result.allowed).toBe(false);
    expect(result.status).toBe("blocked");
    expect(result.findings.some((f) => f.code === "dlp_credit_card")).toBe(true);
  });

  it("Luhn 체크를 통과하지 못하는 번호는 탐지하지 않는다", async () => {
    const buffer = makeTextBuffer("My number is 4111111111111112");
    const result = await evaluateUploadDlp("test.svg", "image/svg+xml", buffer, {
      scanMode: "required",
      detectors: ["credit_card"],
    });
    expect(result.findings.some((f) => f.code === "dlp_credit_card")).toBe(false);
  });

  it("US SSN을 탐지한다", async () => {
    const buffer = makeTextBuffer("SSN: 123-45-6789");
    const result = await evaluateUploadDlp("test.svg", "image/svg+xml", buffer);
    expect(result.allowed).toBe(false);
    expect(result.findings.some((f) => f.code === "dlp_us_ssn")).toBe(true);
  });

  it("한국 주민등록번호를 탐지한다", async () => {
    const buffer = makeTextBuffer("주민번호: 900101-1234567");
    const result = await evaluateUploadDlp("test.svg", "image/svg+xml", buffer);
    expect(result.allowed).toBe(false);
    expect(result.findings.some((f) => f.code === "dlp_korean_rrn")).toBe(true);
  });

  it("AWS 액세스 키를 탐지한다", async () => {
    const buffer = makeTextBuffer("aws_key = AKIAIOSFODNN7EXAMPLE");
    const result = await evaluateUploadDlp("test.svg", "image/svg+xml", buffer);
    expect(result.allowed).toBe(false);
    expect(result.findings.some((f) => f.code === "dlp_aws_access_key")).toBe(true);
  });

  it("프라이빗 키를 탐지한다", async () => {
    const buffer = makeTextBuffer("-----BEGIN RSA PRIVATE KEY-----\nMIIEo...");
    const result = await evaluateUploadDlp("test.svg", "image/svg+xml", buffer);
    expect(result.allowed).toBe(false);
    expect(result.findings.some((f) => f.code === "dlp_private_key")).toBe(true);
  });

  it("깨끗한 텍스트에서는 민감 정보를 탐지하지 않는다", async () => {
    const buffer = makeTextBuffer("This is a clean document with no sensitive data.");
    const result = await evaluateUploadDlp("test.svg", "image/svg+xml", buffer);
    expect(result.allowed).toBe(true);
    expect(result.status).toBe("clean");
    expect(result.findings.filter((f) => f.category === "dlp")).toHaveLength(0);
  });

  it("scan mode가 off이면 bypassed를 반환한다", async () => {
    const buffer = makeTextBuffer("4111111111111111");
    const result = await evaluateUploadDlp("test.svg", "image/svg+xml", buffer, {
      scanMode: "off",
    });
    expect(result.allowed).toBe(true);
    expect(result.status).toBe("bypassed");
  });

  it("지원하지 않는 파일 형식은 bypassed를 반환한다", async () => {
    const buffer = Buffer.from("binary data", "utf8");
    const result = await evaluateUploadDlp("test.png", "image/png", buffer);
    expect(result.allowed).toBe(true);
    expect(result.status).toBe("bypassed");
  });
});
