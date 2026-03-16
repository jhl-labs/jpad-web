import { prisma } from "@/lib/prisma";
import { deletePage as deletePageGit } from "@/lib/git/repository";
import { collectPageSubtree, getWorkspacePages } from "@/lib/pages";
import { removePageEmbeddings } from "@/lib/semanticSearch";
import { deleteFile } from "@/lib/storage";

interface DeletePageSubtreeOptions {
  actorName: string;
  dryRun?: boolean;
}

export async function permanentlyDeletePageSubtree(
  workspaceId: string,
  pageId: string,
  options: DeletePageSubtreeOptions
): Promise<{ deletedCount: number; attachmentCount: number }> {
  const workspacePages = await getWorkspacePages(workspaceId);
  const subtree = collectPageSubtree(workspacePages, pageId);
  if (subtree.length === 0) {
    return { deletedCount: 0, attachmentCount: 0 };
  }

  const subtreeIds = subtree.map((entry) => entry.id);
  const attachments = await prisma.attachment.findMany({
    where: { pageId: { in: subtreeIds } },
    select: { id: true, path: true, storage: true },
  });

  if (options.dryRun) {
    return {
      deletedCount: subtree.length,
      attachmentCount: attachments.length,
    };
  }

  for (const entry of subtree) {
    await deletePageGit(workspaceId, entry.slug, options.actorName);
  }

  for (const attachment of attachments) {
    await deleteFile(attachment.path, attachment.storage ?? "local").catch(() => {
      // File may already be missing.
    });
  }

  await prisma.attachment.deleteMany({
    where: { id: { in: attachments.map((attachment) => attachment.id) } },
  });
  await removePageEmbeddings(subtreeIds);
  await prisma.page.deleteMany({ where: { id: { in: subtreeIds } } });

  return {
    deletedCount: subtree.length,
    attachmentCount: attachments.length,
  };
}
