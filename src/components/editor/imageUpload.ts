const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export interface UploadResult {
  url: string;
  attachmentId: string;
}

export function isImageFile(file: File): boolean {
  return IMAGE_MIME_TYPES.includes(file.type);
}

/**
 * Upload an image file to the server and attach it to a page.
 * Returns the URL and attachment ID on success, or null on failure.
 */
export async function uploadImageToPage(
  file: File,
  workspaceId: string,
  pageId: string
): Promise<UploadResult | null> {
  if (!isImageFile(file)) {
    throw new Error("지원하지 않는 이미지 형식입니다.");
  }

  if (file.size > MAX_FILE_SIZE) {
    throw new Error("파일 크기가 10MB를 초과합니다.");
  }

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("workspaceId", workspaceId);
    formData.append("pageId", pageId);

    const res = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      return null;
    }

    const data: { url: string; id: string } = await res.json();
    return { url: data.url, attachmentId: data.id };
  } catch (error: unknown) {
    console.error("[imageUpload] 업로드 실패:", error);
    return null;
  }
}
