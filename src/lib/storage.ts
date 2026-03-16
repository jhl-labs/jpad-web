import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import fs from "node:fs";
import path from "node:path";

const STORAGE_TYPE = process.env.STORAGE_TYPE || "local";
const LOCAL_UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

let s3Client: S3Client | null = null;

function getS3() {
  if (!s3Client) {
    s3Client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || "",
        secretAccessKey: process.env.S3_SECRET_KEY || "",
      },
      forcePathStyle: true, // Required for MinIO
    });
  }
  return s3Client;
}

function resolveLocalPath(filePath: string): string {
  let resolved: string;

  if (path.isAbsolute(filePath)) {
    resolved = path.resolve(filePath);
  } else if (filePath.startsWith("data/uploads/")) {
    resolved = path.resolve(process.cwd(), filePath);
  } else {
    resolved = path.resolve(LOCAL_UPLOAD_DIR, filePath);
  }

  // Path traversal 방어: 결과가 반드시 UPLOAD_DIR 아래여야 함
  const normalizedUploadDir = path.resolve(LOCAL_UPLOAD_DIR) + path.sep;
  if (!resolved.startsWith(normalizedUploadDir) && resolved !== path.resolve(LOCAL_UPLOAD_DIR)) {
    throw new Error("Invalid file path: path traversal detected");
  }

  return resolved;
}

export async function uploadFile(
  key: string,
  data: Buffer,
  contentType: string
): Promise<{ path: string; storage: string }> {
  if (STORAGE_TYPE === "s3") {
    await getS3().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET || "jpad-uploads",
        Key: key,
        Body: data,
        ContentType: contentType,
      })
    );
    return { path: key, storage: "s3" };
  }

  // Local storage
  const fullPath = resolveLocalPath(key);
  await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.promises.writeFile(fullPath, data);
  return { path: key, storage: "local" };
}

export async function getFile(
  filePath: string,
  storage: string
): Promise<{ data: Buffer; contentType?: string } | null> {
  if (storage === "s3") {
    try {
      const result = await getS3().send(
        new GetObjectCommand({
          Bucket: process.env.S3_BUCKET || "jpad-uploads",
          Key: filePath,
        })
      );
      const stream = result.Body;
      if (!stream) return null;
      const chunks: Uint8Array[] = [];
      for await (const chunk of stream as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      return {
        data: Buffer.concat(chunks),
        contentType: result.ContentType,
      };
    } catch (_error) {
      return null;
    }
  }

  // Local
  const fullPath = resolveLocalPath(filePath);
  try {
    const data = await fs.promises.readFile(fullPath);
    return { data };
  } catch (_error) {
    return null;
  }
}

export async function deleteFile(
  filePath: string,
  storage: string
): Promise<void> {
  if (storage === "s3") {
    await getS3().send(
      new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET || "jpad-uploads",
        Key: filePath,
      })
    );
    return;
  }

  const fullPath = resolveLocalPath(filePath);
  try {
    await fs.promises.unlink(fullPath);
  } catch (_error) {
    // File might not exist
  }
}
