import { describe, it, expect } from "bun:test";
import {
  ScimHttpError,
  SCIM_ERROR_SCHEMA,
  SCIM_CORE_USER_SCHEMA,
  SCIM_CONTENT_TYPE,
  buildScimUserResource,
  buildScimListResponse,
  buildScimDisplayName,
  extractScimEmail,
  normalizeScimUserName,
  parseScimFilter,
  scimError,
  scimJson,
  createScimToken,
  hashScimToken,
} from "@/lib/scim";

describe("scim", () => {
  describe("buildScimUserResource", () => {
    it("SCIM 사용자 응답 형식이 올바름", () => {
      const identity = {
        id: "id-1",
        externalId: "ext-1",
        userName: "user@example.com",
        active: true,
        displayName: "Test User",
        givenName: "Test",
        familyName: "User",
        createdAt: new Date("2024-01-01T00:00:00Z"),
        updatedAt: new Date("2024-06-01T00:00:00Z"),
        organizationId: "org-1",
        userId: "u-1",
        user: {
          id: "u-1",
          email: "user@example.com",
          name: "Test User",
        },
      } as any;

      const resource = buildScimUserResource(identity, "https://app.test/api/scim/v2");

      expect(resource.schemas).toEqual([SCIM_CORE_USER_SCHEMA]);
      expect(resource.id).toBe("id-1");
      expect(resource.userName).toBe("user@example.com");
      expect(resource.active).toBe(true);
      expect(resource.emails).toHaveLength(1);
      expect(resource.emails[0].value).toBe("user@example.com");
      expect(resource.emails[0].primary).toBe(true);
      expect(resource.emails[0].type).toBe("work");
      expect(resource.meta.resourceType).toBe("User");
      expect(resource.meta.location).toBe("https://app.test/api/scim/v2/Users/id-1");
      expect(resource.name.givenName).toBe("Test");
      expect(resource.name.familyName).toBe("User");
    });
  });

  describe("scimError", () => {
    it("SCIM 에러 응답 구조가 올바름", async () => {
      const response = scimError("Not Found", 404, "invalidValue");

      expect(response.status).toBe(404);
      expect(response.headers.get("Content-Type")).toBe(SCIM_CONTENT_TYPE);

      const body = await response.json();
      expect(body.schemas).toEqual([SCIM_ERROR_SCHEMA]);
      expect(body.detail).toBe("Not Found");
      expect(body.status).toBe("404");
      expect(body.scimType).toBe("invalidValue");
    });

    it("scimType 없이도 올바른 에러 응답 생성", async () => {
      const response = scimError("Unauthorized", 401);
      const body = await response.json();

      expect(body.detail).toBe("Unauthorized");
      expect(body.scimType).toBeUndefined();
    });
  });

  describe("extractScimEmail", () => {
    it("이메일 배열에서 primary 이메일 추출", () => {
      const email = extractScimEmail({
        userName: "fallback@example.com",
        emails: [
          { value: "secondary@example.com", primary: false },
          { value: "primary@example.com", primary: true },
        ],
      });
      expect(email).toBe("primary@example.com");
    });

    it("이메일 배열이 없으면 userName에서 추출", () => {
      const email = extractScimEmail({
        userName: "user@example.com",
      });
      expect(email).toBe("user@example.com");
    });

    it("유효한 이메일이 없으면 null 반환", () => {
      const email = extractScimEmail({
        userName: "not-an-email",
        emails: [],
      });
      expect(email).toBeNull();
    });
  });

  describe("buildScimDisplayName", () => {
    it("displayName이 있으면 그대로 사용", () => {
      expect(
        buildScimDisplayName({ displayName: "John Doe", givenName: "John", familyName: "Doe" })
      ).toBe("John Doe");
    });

    it("displayName 없으면 givenName + familyName 조합", () => {
      expect(
        buildScimDisplayName({ givenName: "John", familyName: "Doe" })
      ).toBe("John Doe");
    });

    it("이름 정보 없으면 이메일의 로컬 부분 사용", () => {
      expect(buildScimDisplayName({ email: "john@example.com" })).toBe("john");
    });

    it("모든 정보 없으면 'SCIM User' 반환", () => {
      expect(buildScimDisplayName({})).toBe("SCIM User");
    });
  });

  describe("parseScimFilter", () => {
    it("유효한 필터 파싱", () => {
      const filter = parseScimFilter('userName eq "test@example.com"', ["userName", "externalId"]);
      expect(filter).toEqual({ field: "userName", value: "test@example.com" });
    });

    it("null 필터 입력은 null 반환", () => {
      expect(parseScimFilter(null, ["userName"])).toBeNull();
    });

    it("지원하지 않는 필드는 에러 발생", () => {
      expect(() =>
        parseScimFilter('unsupported eq "val"', ["userName"])
      ).toThrow();
    });
  });

  describe("buildScimListResponse", () => {
    it("리스트 응답 구조가 올바름", () => {
      const response = buildScimListResponse(["a", "b"], 10, 1, 2);
      expect(response.totalResults).toBe(10);
      expect(response.startIndex).toBe(1);
      expect(response.itemsPerPage).toBe(2);
      expect(response.Resources).toEqual(["a", "b"]);
    });
  });

  describe("ScimHttpError", () => {
    it("올바른 에러 속성 설정", () => {
      const error = new ScimHttpError(409, "Conflict", "mutability");
      expect(error.status).toBe(409);
      expect(error.message).toBe("Conflict");
      expect(error.scimType).toBe("mutability");
      expect(error.name).toBe("ScimHttpError");
    });
  });

  describe("토큰 생성 및 해싱", () => {
    it("SCIM 토큰은 jpad_scim_ 접두사로 시작", () => {
      const token = createScimToken();
      expect(token.startsWith("jpad_scim_")).toBe(true);
    });

    it("토큰 해싱이 결정적", () => {
      const hash1 = hashScimToken("test-token");
      const hash2 = hashScimToken("test-token");
      expect(hash1).toBe(hash2);
    });

    it("다른 토큰은 다른 해시 생성", () => {
      const hash1 = hashScimToken("token-a");
      const hash2 = hashScimToken("token-b");
      expect(hash1).not.toBe(hash2);
    });
  });
});
