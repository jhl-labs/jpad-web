import { NextRequest } from "next/server";
import { GET as getAttachmentRoute } from "../../src/app/api/upload/[attachmentId]/route";
import { randomUUID } from "crypto";
import { rescanAttachmentById } from "../../src/lib/attachmentSecurity";
import { prisma } from "../../src/lib/prisma";
import { deleteFile, uploadFile } from "../../src/lib/storage";

const EICAR_SIGNATURE =
  "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

async function main() {
  const previous = {
    mode: process.env.UPLOAD_MALWARE_SCAN_MODE,
    host: process.env.UPLOAD_CLAMAV_HOST,
    builtin: process.env.UPLOAD_ENABLE_BUILTIN_EICAR,
  };

  const user = await prisma.user.create({
    data: {
      email: `attachment-rescan-smoke-${randomUUID()}@example.com`,
      name: "Attachment Rescan Smoke",
      hashedPassword: "smoke",
    },
  });

  const workspace = await prisma.workspace.create({
    data: {
      name: "Attachment Rescan Smoke",
      slug: `attachment-rescan-smoke-${randomUUID()}`,
    },
  });

  const page = await prisma.page.create({
    data: {
      title: "Attachment Rescan Smoke",
      slug: `attachment-rescan-smoke-${randomUUID()}`,
      workspaceId: workspace.id,
    },
  });

  const key = `${workspace.id}/${randomUUID()}-eicar.docx`;
  const stored = await uploadFile(
    key,
    Buffer.from(EICAR_SIGNATURE, "latin1"),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );

  const attachment = await prisma.attachment.create({
    data: {
      filename: "eicar.docx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size: EICAR_SIGNATURE.length,
      path: stored.path,
      storage: stored.storage,
      securityStatus: "error",
      pageId: page.id,
      userId: user.id,
    },
  });

  try {
    process.env.UPLOAD_MALWARE_SCAN_MODE = "required";
    delete process.env.UPLOAD_CLAMAV_HOST;
    process.env.UPLOAD_ENABLE_BUILTIN_EICAR = "1";

    const result = await rescanAttachmentById(attachment.id);
    if (!result.quarantined || result.nextStatus !== "blocked") {
      throw new Error(`expected attachment to be quarantined, got ${JSON.stringify(result)}`);
    }

    const refreshed = await prisma.attachment.findUnique({
      where: { id: attachment.id },
      select: {
        securityStatus: true,
      },
    });
    if (!refreshed || refreshed.securityStatus !== "blocked") {
      throw new Error("attachment row was not updated to blocked");
    }

    const response = await getAttachmentRoute(
      new NextRequest(`http://localhost/api/upload/${attachment.id}`),
      {
        params: Promise.resolve({ attachmentId: attachment.id }),
      }
    );
    if (response.status !== 423) {
      throw new Error(`expected quarantined download to return 423, got ${response.status}`);
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          attachmentId: attachment.id,
          nextStatus: result.nextStatus,
          quarantined: result.quarantined,
          downloadStatus: response.status,
        },
        null,
        2
      )
    );
  } finally {
    process.env.UPLOAD_MALWARE_SCAN_MODE = previous.mode;
    process.env.UPLOAD_CLAMAV_HOST = previous.host;
    process.env.UPLOAD_ENABLE_BUILTIN_EICAR = previous.builtin;

    await deleteFile(stored.path, stored.storage);
    await prisma.workspace.delete({ where: { id: workspace.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }
}

main()
  .catch((error) => {
    console.error(
      JSON.stringify(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        null,
        2
      )
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
