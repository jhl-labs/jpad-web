import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { getBackupConfig, type RestoreDrillSummary } from "../src/lib/backup";
import {
  ensureDir,
  fileExists,
  isCommandAvailable,
  runCommand,
  sha256File,
} from "../src/lib/backupRuntime";
import { logError, logInfo } from "../src/lib/logger";
import { prisma } from "../src/lib/prisma";

let restoreDrillRunId: string | null = null;

function readFlag(name: string): string | null {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function readFileHead(filePath: string, bytes = 2048): Promise<string> {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

async function main() {
  const trigger = readFlag("--trigger") || process.env.RESTORE_DRILL_TRIGGER || "manual";
  const backupRunId = readFlag("--backup-run-id");
  const config = getBackupConfig();
  const gitAvailable = await isCommandAvailable(config.gitBin);

  const backupRun = await prisma.backupRun.findFirst({
    where: backupRunId
      ? { id: backupRunId, status: "success", mode: "execute" }
      : { status: "success", mode: "execute" },
    include: {
      artifacts: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      },
    },
    orderBy: backupRunId ? undefined : [{ startedAt: "desc" }, { id: "desc" }],
  });

  if (!backupRun) {
    throw new Error(
      backupRunId
        ? `Backup run not found or not successful: ${backupRunId}`
        : "No successful execute backup run is available"
    );
  }

  const run = await prisma.restoreDrillRun.create({
    data: {
      backupRunId: backupRun.id,
      trigger,
    },
    select: { id: true },
  });
  restoreDrillRunId = run.id;

  logInfo("backup.restore_drill.started", {
    restoreDrillRunId: run.id,
    backupRunId: backupRun.id,
    trigger,
  });

  const artifacts = backupRun.artifacts.filter((artifact) => artifact.status === "created");
  const summary: RestoreDrillSummary = {
    verifiedArtifactCount: 0,
    checksumVerifiedCount: 0,
    archiveVerifiedCount: 0,
    sampledRepoCount: 0,
    repoFsckPassedCount: 0,
    warnings: [],
    artifactResults: [],
  };

  const extractRoot = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), `jpad-restore-drill-${backupRun.id.slice(0, 8)}-`)
  );

  try {
    for (const artifact of artifacts) {
      if (!artifact.filePath) {
        throw new Error(`Artifact ${artifact.kind} is missing filePath`);
      }

      const exists = await fileExists(artifact.filePath);
      if (!exists) {
        throw new Error(`Artifact file is missing: ${artifact.filePath}`);
      }

      if (artifact.checksumSha256) {
        const checksum = await sha256File(artifact.filePath);
        if (checksum !== artifact.checksumSha256) {
          throw new Error(`Checksum mismatch for ${artifact.kind}: ${artifact.filePath}`);
        }
        summary.checksumVerifiedCount += 1;
      } else {
        summary.warnings.push(`Checksum missing for ${artifact.kind}`);
      }

      const artifactResult: RestoreDrillSummary["artifactResults"][number] = {
        kind: artifact.kind,
        filePath: artifact.filePath,
        status: "verified",
      };

      if (artifact.kind === "postgres_dump") {
        const head = await readFileHead(artifact.filePath);
        if (!head.includes("PostgreSQL database dump") && !head.includes("SET ")) {
          throw new Error(`Unexpected pg_dump header for ${artifact.filePath}`);
        }
        artifactResult.details = { validation: "pg_dump_header" };
      } else if (artifact.kind === "database_export") {
        const parsed = JSON.parse(await fs.promises.readFile(artifact.filePath, "utf8")) as {
          format?: string;
          tables?: Record<string, unknown[]>;
        };
        if (parsed.format !== "logical_json_v1" || !parsed.tables) {
          throw new Error(`Invalid logical JSON export: ${artifact.filePath}`);
        }
        artifactResult.details = {
          validation: "logical_json_parse",
          tableCount: Object.keys(parsed.tables).length,
        };
      } else if (artifact.kind.endsWith("_archive")) {
        await runCommand(config.tarBin, ["-tzf", artifact.filePath]);
        summary.archiveVerifiedCount += 1;
        artifactResult.details = { validation: "tar_list" };

        if (artifact.kind === "repos_archive") {
          await ensureDir(extractRoot);
          await runCommand(config.tarBin, ["-xzf", artifact.filePath, "-C", extractRoot]);

          const reposRoot = path.join(extractRoot, "repos");
          const repoDirs = (await fs.promises.readdir(reposRoot, { withFileTypes: true }))
            .filter((entry) => entry.isDirectory())
            .map((entry) => path.join(reposRoot, entry.name))
            .slice(0, config.restoreDrillRepoSampleLimit);

          summary.sampledRepoCount += repoDirs.length;

          if (!gitAvailable) {
            summary.warnings.push("git binary is unavailable, repo fsck was skipped");
            artifactResult.details = {
              ...(artifactResult.details || {}),
              repoFsck: "skipped_no_git",
              sampledRepoCount: repoDirs.length,
            };
          } else {
            for (const repoDir of repoDirs) {
              await runCommand(config.gitBin, ["-C", repoDir, "fsck", "--full", "--no-progress"]);
              summary.repoFsckPassedCount += 1;
            }
            artifactResult.details = {
              ...(artifactResult.details || {}),
              repoFsck: "passed",
              sampledRepoCount: repoDirs.length,
            };
          }
        }
      } else if (artifact.kind === "manifest") {
        const manifest = JSON.parse(await fs.promises.readFile(artifact.filePath, "utf8")) as {
          artifacts?: unknown[];
        };
        artifactResult.details = {
          validation: "manifest_parse",
          artifactCount: Array.isArray(manifest.artifacts) ? manifest.artifacts.length : 0,
        };
      }

      summary.verifiedArtifactCount += 1;
      summary.artifactResults.push(artifactResult);
    }
  } finally {
    await fs.promises.rm(extractRoot, { recursive: true, force: true });
  }

  await prisma.restoreDrillRun.update({
    where: { id: run.id },
    data: {
      status: "success",
      summary: toJsonValue(summary),
      finishedAt: new Date(),
    },
  });

  logInfo("backup.restore_drill.completed", {
    restoreDrillRunId: run.id,
    backupRunId: backupRun.id,
    trigger,
    summary,
  });

  console.log(
    JSON.stringify(
      {
        restoreDrillRunId: run.id,
        backupRunId: backupRun.id,
        trigger,
        summary,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    logError("backup.restore_drill.failed", error, { restoreDrillRunId });
    if (restoreDrillRunId) {
      prisma.restoreDrillRun
        .update({
          where: { id: restoreDrillRunId },
          data: {
            status: "error",
            errorMessage: error instanceof Error ? error.message : String(error),
            finishedAt: new Date(),
          },
        })
        .catch(() => {
          // Ignore secondary persistence failure.
        });
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
