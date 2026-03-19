import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

// Re-establish the real secrets module (other tests may have mocked it)
// secrets.ts only depends on node:crypto which doesn't need mocking
const { encryptSecret, decryptSecret, SecretEncryptionError } = await import("@/lib/secrets");

describe("secrets", () => {
  const originalKey = process.env.APP_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key-for-unit-tests";
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.APP_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.APP_ENCRYPTION_KEY;
    }
  });

  it("encryptSecret → decryptSecret 왕복 테스트", () => {
    const original = "my-super-secret-api-key";
    const encrypted = encryptSecret(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted.startsWith("enc:v1:")).toBe(true);

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(original);
  });

  it("다양한 문자열에 대해 왕복 테스트 성공", () => {
    const testCases = [
      "simple",
      "with spaces and special chars !@#$%^&*()",
      "한국어 텍스트",
      "a".repeat(1000),
      "emoji 🎉🎊",
    ];
    for (const original of testCases) {
      const encrypted = encryptSecret(original);
      const decrypted = decryptSecret(encrypted);
      expect(decrypted).toBe(original);
    }
  });

  it("빈 문자열은 그대로 반환한다", () => {
    expect(encryptSecret("")).toBe("");
    expect(decryptSecret("")).toBeNull();
    expect(decryptSecret(null)).toBeNull();
    expect(decryptSecret(undefined)).toBeNull();
  });

  it("이미 암호화된 문자열은 재암호화하지 않는다", () => {
    const original = "test-secret";
    const encrypted = encryptSecret(original);
    const doubleEncrypted = encryptSecret(encrypted);
    expect(doubleEncrypted).toBe(encrypted);
  });

  it("잘못된 형식 복호화 시 에러를 던진다", () => {
    expect(() => decryptSecret("enc:v1:invalid:data:here")).toThrow(SecretEncryptionError);
  });

  it("enc:v1 프리픽스 없는 문자열은 그대로 반환한다 (레거시 호환)", () => {
    expect(decryptSecret("plain-text-secret")).toBe("plain-text-secret");
  });

  it("APP_ENCRYPTION_KEY 미설정 시 에러를 던진다", () => {
    delete process.env.APP_ENCRYPTION_KEY;
    expect(() => encryptSecret("test")).toThrow(SecretEncryptionError);
    expect(() => encryptSecret("test")).toThrow("APP_ENCRYPTION_KEY");
  });

  it("다른 키로 복호화 시 실패한다", () => {
    const encrypted = encryptSecret("secret-data");
    process.env.APP_ENCRYPTION_KEY = "different-key";
    expect(() => decryptSecret(encrypted)).toThrow(SecretEncryptionError);
  });
});
