import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import fs from "node:fs";
import path from "node:path";
import { withLock } from "./lock";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";
import { logError } from "@/lib/logger";

const REPOS_DIR = path.join(process.cwd(), "data", "repos");

function getRepoPath(workspaceId: string) {
  const resolved = path.resolve(REPOS_DIR, workspaceId);
  if (!resolved.startsWith(REPOS_DIR)) {
    throw new Error("Invalid workspaceId");
  }
  return resolved;
}

interface GitSyncSettings {
  gitRemoteUrl: string;
  gitRemoteToken: string | null;
  gitRemoteBranch: string;
  gitSyncMode: string | null;
}

function makeOnAuth(encryptedToken: string | null) {
  const token = decryptSecret(encryptedToken);
  if (!token) return undefined;
  return () => ({ username: token, password: "x-oauth-basic" });
}

export async function configureRemote(
  workspaceId: string,
  url: string
): Promise<void> {
  const dir = getRepoPath(workspaceId);

  // Skip if remote is already configured with the correct URL
  try {
    const remotes = await git.listRemotes({ fs, dir });
    const existing = remotes.find(r => r.remote === "origin");
    if (existing?.url === url) return;
  } catch { /* ignore */ }

  // Remove existing remote if present
  try {
    await git.deleteRemote({ fs, dir, remote: "origin" });
  } catch (_error: unknown) {
    // Remote may not exist yet
  }

  await git.addRemote({ fs, dir, remote: "origin", url });
}

export async function removeRemote(workspaceId: string): Promise<void> {
  const dir = getRepoPath(workspaceId);

  try {
    await git.deleteRemote({ fs, dir, remote: "origin" });
  } catch (_error: unknown) {
    // Remote may not exist
  }
}

export async function pushToRemote(
  workspaceId: string,
  settings: GitSyncSettings
): Promise<{ filesChanged: number }> {
  return withLock(`git-sync:${workspaceId}`, async () => {
    const dir = getRepoPath(workspaceId);

    await configureRemote(workspaceId, settings.gitRemoteUrl);

    const remoteBranch = settings.gitRemoteBranch || "main";
    const onAuth = makeOnAuth(settings.gitRemoteToken);

    // Detect local branch name (may be "master" or "main")
    let localBranch = "main";
    try {
      const head = await fs.promises.readFile(path.join(dir, ".git", "HEAD"), "utf-8");
      const match = head.trim().match(/^ref: refs\/heads\/(.+)$/);
      if (match) localBranch = match[1];
    } catch { /* use default */ }

    // First attempt: normal push
    let pushResult = await git.push({
      fs,
      http,
      dir,
      remote: "origin",
      ref: localBranch,
      remoteRef: remoteBranch,
      onAuth,
      force: false,
    });

    // If fast-forward fails, try force push (initial sync with diverged histories)
    if (pushResult.error && pushResult.error.includes("not a simple fast-forward")) {
      pushResult = await git.push({
        fs,
        http,
        dir,
        remote: "origin",
        ref: localBranch,
        remoteRef: remoteBranch,
        onAuth,
        force: true,
      });
    }

    if (pushResult.error) {
      throw new Error(`Push failed: ${pushResult.error}`);
    }

    return { filesChanged: 0 };
  });
}

export async function pullFromRemote(
  workspaceId: string,
  settings: GitSyncSettings
): Promise<{ filesChanged: number }> {
  return withLock(`git-sync:${workspaceId}`, async () => {
    const dir = getRepoPath(workspaceId);

    await configureRemote(workspaceId, settings.gitRemoteUrl);

    const remoteBranch = settings.gitRemoteBranch || "main";
    const onAuth = makeOnAuth(settings.gitRemoteToken);

    // Detect local branch name
    let localBranch = "main";
    try {
      const head = await fs.promises.readFile(path.join(dir, ".git", "HEAD"), "utf-8");
      const match = head.trim().match(/^ref: refs\/heads\/(.+)$/);
      if (match) localBranch = match[1];
    } catch { /* use default */ }

    // Fetch from remote (may fail on empty repos)
    try {
      await git.fetch({
        fs,
        http,
        dir,
        remote: "origin",
        ref: remoteBranch,
        onAuth,
        singleBranch: true,
      });
    } catch (fetchErr: unknown) {
      const msg = fetchErr instanceof Error ? fetchErr.message : "";
      // Empty remote repo or branch not found — nothing to pull
      if (msg.includes("could not find") || msg.includes("not found") || msg.includes("HttpError")) {
        return { filesChanged: 0 };
      }
      throw fetchErr;
    }

    // Fast-forward merge: get remote ref
    const remoteRef = `refs/remotes/origin/${remoteBranch}`;

    let remoteOid: string;
    try {
      remoteOid = await git.resolveRef({ fs, dir, ref: remoteRef });
    } catch (_error: unknown) {
      // Remote ref not found - nothing to pull
      return { filesChanged: 0 };
    }

    let localOid: string;
    try {
      localOid = await git.resolveRef({ fs, dir, ref: "HEAD" });
    } catch (_error: unknown) {
      localOid = "";
    }

    if (localOid === remoteOid) {
      return { filesChanged: 0 };
    }

    // Check if remote is ahead of local (fast-forward possible)
    let canFastForward = false;
    if (localOid) {
      try {
        canFastForward = await git.isDescendent({
          fs,
          dir,
          oid: remoteOid,
          ancestor: localOid,
        });
      } catch { /* treat as diverged */ }
    }

    if (!canFastForward) {
      // Histories diverged — force reset local to remote state
      const localRefPath = path.join(dir, ".git", "refs", "heads", localBranch);
      await fs.promises.mkdir(path.dirname(localRefPath), { recursive: true });
      await fs.promises.writeFile(localRefPath, remoteOid + "\n");
    }

    // Checkout the local branch to update working tree
    await git.checkout({
      fs,
      dir,
      ref: localBranch,
      force: true,
    });

    // Count changed files by comparing trees
    let filesChanged = 0;
    try {
      const trees = await git.walk({
        fs,
        dir,
        trees: [git.TREE({ ref: localOid }), git.TREE({ ref: remoteOid })],
        map: async (filepath, entries) => {
          if (!entries || filepath === ".") return undefined;
          const [a, b] = entries;
          const aOid = a ? await a.oid() : null;
          const bOid = b ? await b.oid() : null;
          if (aOid !== bOid) filesChanged++;
          return filepath;
        },
      });
      // walk returns results but we only need the side-effect count
      void trees;
    } catch (err) {
      logError("git.sync.tree_walk_failed", err, { workspaceId });
    }

    return { filesChanged };
  });
}

export async function testRemoteConnection(
  url: string,
  encryptedToken: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const onAuth = makeOnAuth(encryptedToken);
    const info = await git.getRemoteInfo({
      http,
      url,
      onAuth,
    });

    if (info.refs?.heads) {
      return { success: true };
    }

    return { success: true };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown connection error";
    return { success: false, error: message };
  }
}

export async function getSyncStatus(
  workspaceId: string,
  settings: GitSyncSettings
): Promise<{
  localHead: string | null;
  remoteHead: string | null;
  inSync: boolean;
}> {
  const dir = getRepoPath(workspaceId);

  let localHead: string | null = null;
  try {
    localHead = await git.resolveRef({ fs, dir, ref: "HEAD" });
  } catch (_error: unknown) {
    // No local HEAD
  }

  let remoteHead: string | null = null;
  try {
    const onAuth = makeOnAuth(settings.gitRemoteToken);
    const info = await git.getRemoteInfo({
      http,
      url: settings.gitRemoteUrl,
      onAuth,
    });
    const branch = settings.gitRemoteBranch || "main";
    remoteHead = info.refs?.heads?.[branch] ?? null;
  } catch (_error: unknown) {
    // Cannot reach remote
  }

  return {
    localHead,
    remoteHead,
    inSync: localHead !== null && localHead === remoteHead,
  };
}

export async function triggerAutoSync(workspaceId: string): Promise<void> {
  try {
    const settings = await prisma.workspaceSettings.findUnique({
      where: { workspaceId },
    });

    if (
      !settings ||
      !settings.gitSyncEnabled ||
      !settings.gitAutoSyncOnSave ||
      !settings.gitRemoteUrl
    ) {
      return;
    }

    const syncMode = settings.gitSyncMode || "push_only";
    if (syncMode !== "push_only" && syncMode !== "bidirectional") {
      return;
    }

    const syncSettings: GitSyncSettings = {
      gitRemoteUrl: settings.gitRemoteUrl,
      gitRemoteToken: settings.gitRemoteToken,
      gitRemoteBranch: settings.gitRemoteBranch || "main",
      gitSyncMode: settings.gitSyncMode,
    };

    // Create sync log entry
    const logEntry = await prisma.gitSyncLog.create({
      data: {
        workspaceId,
        direction: "push",
        trigger: "auto_save",
        status: "running",
      },
    });

    try {
      const result = await pushToRemote(workspaceId, syncSettings);

      await prisma.gitSyncLog.update({
        where: { id: logEntry.id },
        data: {
          status: "success",
          filesChanged: result.filesChanged,
          finishedAt: new Date(),
        },
      });
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown sync error";

      await prisma.gitSyncLog.update({
        where: { id: logEntry.id },
        data: {
          status: "error",
          errorMessage,
          finishedAt: new Date(),
        },
      });
    }
  } catch (err: unknown) {
    logError("git.auto_sync.failed", err, { workspaceId });
  }
}
