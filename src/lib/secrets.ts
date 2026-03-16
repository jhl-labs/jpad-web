import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ENCRYPTED_SECRET_PREFIX = "enc:v1";

export class SecretEncryptionError extends Error {}

function getSecretKey(): Buffer {
  const rawKey = process.env.APP_ENCRYPTION_KEY;
  if (!rawKey) {
    throw new SecretEncryptionError(
      "APP_ENCRYPTION_KEY must be configured to store workspace secrets"
    );
  }

  return createHash("sha256").update(rawKey).digest();
}

export function encryptSecret(secret: string): string {
  if (!secret) return secret;
  if (secret.startsWith(`${ENCRYPTED_SECRET_PREFIX}:`)) {
    return secret;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getSecretKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(secret, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTED_SECRET_PREFIX,
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function decryptSecret(secret: string | null | undefined): string | null {
  if (!secret) return null;
  if (!secret.startsWith(`${ENCRYPTED_SECRET_PREFIX}:`)) {
    return secret;
  }

  const parts = secret.split(":");
  if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== ENCRYPTED_SECRET_PREFIX) {
    throw new SecretEncryptionError("Invalid encrypted secret format");
  }

  const [, , ivEncoded, authTagEncoded, ciphertextEncoded] = parts;

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getSecretKey(),
      Buffer.from(ivEncoded, "base64url")
    );
    decipher.setAuthTag(Buffer.from(authTagEncoded, "base64url"));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextEncoded, "base64url")),
      decipher.final(),
    ]);

    return plaintext.toString("utf8");
  } catch {
    throw new SecretEncryptionError("Failed to decrypt workspace secret");
  }
}
