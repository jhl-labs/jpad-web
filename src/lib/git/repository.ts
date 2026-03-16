import git from "isomorphic-git";
import fs from "node:fs";
import path from "node:path";
import { withLock } from "./lock";

const REPOS_DIR = path.join(process.cwd(), "data", "repos");

function getRepoPath(workspaceId: string) {
  return path.join(REPOS_DIR, workspaceId);
}

export async function initRepo(workspaceId: string) {
  const dir = getRepoPath(workspaceId);
  await fs.promises.mkdir(dir, { recursive: true });

  const gitDir = path.join(dir, ".git");
  if (!fs.existsSync(gitDir)) {
    await git.init({ fs, dir });

    // Create initial README
    const readmePath = path.join(dir, "README.md");
    await fs.promises.writeFile(readmePath, `# Workspace\n\nInitialized.`);
    await git.add({ fs, dir, filepath: "README.md" });
    await git.commit({
      fs,
      dir,
      message: "Initial commit",
      author: { name: "JPAD", email: "system@jpad.local" },
    });
  }

  return dir;
}

export async function savePage(
  workspaceId: string,
  slug: string,
  content: string,
  authorName: string,
  message?: string
) {
  return withLock(workspaceId + ":" + slug, async () => {
    const dir = getRepoPath(workspaceId);
    const filepath = `${slug}.md`;
    const fullPath = path.join(dir, filepath);

    // Ensure parent directory exists
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(fullPath, content, "utf-8");

    await git.add({ fs, dir, filepath });

    const sha = await git.commit({
      fs,
      dir,
      message: message || `Update ${slug}`,
      author: { name: authorName, email: "user@jpad.local" },
    });

    return sha;
  });
}

export async function readPage(
  workspaceId: string,
  slug: string
): Promise<string | null> {
  const dir = getRepoPath(workspaceId);
  const fullPath = path.resolve(dir, `${slug}.md`);

  // Path traversal defense
  if (!fullPath.startsWith(dir)) {
    return null;
  }

  try {
    return await fs.promises.readFile(fullPath, "utf-8");
  } catch {
    return null;
  }
}

export async function deletePage(
  workspaceId: string,
  slug: string,
  authorName: string
) {
  return withLock(workspaceId + ":" + slug, async () => {
    const dir = getRepoPath(workspaceId);
    const filepath = `${slug}.md`;
    const fullPath = path.join(dir, filepath);

    try {
      await fs.promises.unlink(fullPath);
      await git.remove({ fs, dir, filepath });
      await git.commit({
        fs,
        dir,
        message: `Delete ${slug}`,
        author: { name: authorName, email: "user@jpad.local" },
      });
    } catch {
      // File might not exist
    }
  });
}

export async function getPageHistory(workspaceId: string, slug: string) {
  const dir = getRepoPath(workspaceId);
  const filepath = `${slug}.md`;

  try {
    const commits = await git.log({ fs, dir });
    const relevant = [];

    for (const commit of commits) {
      try {
        // Check if this commit affected the file
        const result = await git.readBlob({
          fs,
          dir,
          oid: commit.oid,
          filepath,
        });
        if (result) {
          relevant.push({
            oid: commit.oid,
            message: commit.commit.message,
            author: commit.commit.author.name,
            timestamp: commit.commit.author.timestamp * 1000,
          });
        }
      } catch {
        // File doesn't exist in this commit
      }
    }

    return relevant;
  } catch {
    return [];
  }
}

export async function getPageAtCommit(
  workspaceId: string,
  slug: string,
  oid: string
): Promise<string | null> {
  const dir = getRepoPath(workspaceId);
  const filepath = `${slug}.md`;

  try {
    const result = await git.readBlob({ fs, dir, oid, filepath });
    return new TextDecoder().decode(result.blob);
  } catch {
    return null;
  }
}
