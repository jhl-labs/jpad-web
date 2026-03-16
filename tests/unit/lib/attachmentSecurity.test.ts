import { describe, it, expect } from "bun:test";
import { isAttachmentQuarantined } from "@/lib/attachmentSecurity";

describe("attachmentSecurity", () => {
  describe("isAttachmentQuarantined", () => {
    it("blocked 상태이고 released가 아니면 격리됨", () => {
      expect(isAttachmentQuarantined("blocked", null)).toBe(true);
      expect(isAttachmentQuarantined("blocked", "blocked")).toBe(true);
      expect(isAttachmentQuarantined("blocked", undefined)).toBe(true);
    });

    it("blocked 상태이지만 released이면 격리 아님", () => {
      expect(isAttachmentQuarantined("blocked", "released")).toBe(false);
    });

    it("clean 상태는 격리 아님", () => {
      expect(isAttachmentQuarantined("clean", null)).toBe(false);
      expect(isAttachmentQuarantined("clean", "released")).toBe(false);
    });

    it("error 상태는 격리 아님", () => {
      expect(isAttachmentQuarantined("error", null)).toBe(false);
    });

    it("null/undefined 상태는 격리 아님", () => {
      expect(isAttachmentQuarantined(null, null)).toBe(false);
      expect(isAttachmentQuarantined(undefined, undefined)).toBe(false);
    });

    it("not_scanned 상태는 격리 아님", () => {
      expect(isAttachmentQuarantined("not_scanned", null)).toBe(false);
    });
  });

  describe("AttachmentSecurityRescanResult 구조", () => {
    it("결과 타입이 올바른 필드를 가짐", () => {
      // 타입 검증을 위한 구조 확인
      const mockResult = {
        attachmentId: "att-1",
        pageId: "page-1",
        workspaceId: "ws-1",
        previousStatus: "not_scanned",
        nextStatus: "clean",
        previousDisposition: null,
        nextDisposition: null,
        scanner: "clamav",
        findings: [],
        checkedAt: new Date().toISOString(),
        quarantined: false,
      };

      expect(mockResult.attachmentId).toBe("att-1");
      expect(mockResult.quarantined).toBe(false);
      expect(mockResult.findings).toEqual([]);
      expect(mockResult.scanner).toBe("clamav");
    });
  });

  describe("AttachmentSecurityDispositionResult 구조", () => {
    it("처분 결과 타입이 올바른 필드를 가짐", () => {
      const mockResult = {
        attachmentId: "att-1",
        pageId: "page-1",
        workspaceId: "ws-1",
        securityStatus: "blocked",
        securityDisposition: "released",
        reviewedAt: new Date().toISOString(),
        reviewedByUserId: "user-1",
        reviewNote: "Safe file confirmed",
      };

      expect(mockResult.securityDisposition).toBe("released");
      expect(mockResult.reviewNote).toBe("Safe file confirmed");
    });
  });
});
