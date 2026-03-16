import fs from "node:fs";
import path from "node:path";

const SNAPSHOT_DIR = process.env.YJS_SNAPSHOT_DIR
  ? path.resolve(process.env.YJS_SNAPSHOT_DIR)
  : path.join(process.cwd(), "data", "yjs");

function sanitizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getSnapshotPath(docName: string) {
  const [workspaceId, pageId] = docName.split(":");

  if (workspaceId && pageId) {
    return path.join(
      SNAPSHOT_DIR,
      sanitizeSegment(workspaceId),
      `${sanitizeSegment(pageId)}.bin`
    );
  }

  return path.join(SNAPSHOT_DIR, `${encodeURIComponent(docName)}.bin`);
}

export async function loadDocSnapshot(docName: string): Promise<Uint8Array | null> {
  const filePath = getSnapshotPath(docName);

  try {
    const data = await fs.promises.readFile(filePath);
    return new Uint8Array(data);
  } catch {
    return null;
  }
}

export async function saveDocSnapshot(
  docName: string,
  snapshot: Uint8Array
): Promise<void> {
  const filePath = getSnapshotPath(docName);
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(tempPath, Buffer.from(snapshot));
  await fs.promises.rename(tempPath, filePath);
}
