import fs from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import {
  formatBackupStamp,
  getBackupConfig,
  type BackupArtifactManifestEntry,
  type BackupSummary,
} from "../src/lib/backup";
import {
  ensureDir,
  isCommandAvailable,
  runCommand,
  sha256File,
  statPath,
} from "../src/lib/backupRuntime";
import { logError, logInfo } from "../src/lib/logger";
import { prisma } from "../src/lib/prisma";

let backupRunId: string | null = null;

function readFlag(name: string): string | null {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function addBytes(total: string, next: string | null): string {
  if (!next) {
    return total;
  }

  return (BigInt(total) + BigInt(next)).toString();
}

async function captureFileArtifact(
  kind: string,
  filePath: string,
  metadata?: Record<string, unknown>
): Promise<BackupArtifactManifestEntry> {
  const stats = await fs.promises.stat(filePath);
  const checksumSha256 = await sha256File(filePath);

  return {
    kind,
    status: "created",
    filePath,
    sizeBytes: String(stats.size),
    checksumSha256,
    metadata: metadata ?? null,
  };
}

async function exportDatabaseToLogicalJson(filePath: string) {
  const [
    users,
    organizations,
    organizationMembers,
    organizationDomains,
    organizationScimTokens,
    organizationScimIdentities,
    organizationScimGroups,
    organizationScimGroupMembers,
    workspaces,
    workspaceMembers,
    workspaceScimGroupMappings,
    workspaceScimProvisionedMembers,
    pages,
    pageEmbeddingChunks,
    searchIndexJobs,
    pagePermissions,
    pageShareLinks,
    backlinks,
    comments,
    attachments,
    favorites,
    aiChats,
    auditLogs,
    retentionRuns,
    retentionRunWorkspaces,
    backupRuns,
    backupArtifacts,
    restoreDrillRuns,
    searchIndexWorkerRuns,
    searchIndexWorkerRunWorkspaces,
    workspaceSettings,
  ] = await prisma.$transaction([
    prisma.user.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.organization.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.organizationMember.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.organizationDomain.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.organizationScimToken.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.organizationScimIdentity.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.organizationScimGroup.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.organizationScimGroupMember.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.workspace.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.workspaceMember.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.workspaceScimGroupMapping.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.workspaceScimProvisionedMember.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.page.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.pageEmbeddingChunk.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.searchIndexJob.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.pagePermission.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.pageShareLink.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.backlink.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.comment.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.attachment.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.favorite.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.aiChat.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.auditLog.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.retentionRun.findMany({ orderBy: [{ startedAt: "asc" }, { id: "asc" }] }),
    prisma.retentionRunWorkspace.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.backupRun.findMany({ orderBy: [{ startedAt: "asc" }, { id: "asc" }] }),
    prisma.backupArtifact.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    prisma.restoreDrillRun.findMany({ orderBy: [{ startedAt: "asc" }, { id: "asc" }] }),
    prisma.searchIndexWorkerRun.findMany({
      orderBy: [{ startedAt: "asc" }, { id: "asc" }],
    }),
    prisma.searchIndexWorkerRunWorkspace.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.workspaceSettings.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
  ]);

  const payload = {
    format: "logical_json_v1",
    exportedAt: new Date().toISOString(),
    tables: {
      users,
      organizations,
      organizationMembers,
      organizationDomains,
      organizationScimTokens,
      organizationScimIdentities,
      organizationScimGroups,
      organizationScimGroupMembers,
      workspaces,
      workspaceMembers,
      workspaceScimGroupMappings,
      workspaceScimProvisionedMembers,
      pages,
      pageEmbeddingChunks,
      searchIndexJobs,
      pagePermissions,
      pageShareLinks,
      backlinks,
      comments,
      attachments,
      favorites,
      aiChats,
      auditLogs,
      retentionRuns,
      retentionRunWorkspaces,
      backupRuns,
      backupArtifacts,
      restoreDrillRuns,
      searchIndexWorkerRuns,
      searchIndexWorkerRunWorkspaces,
      workspaceSettings,
    },
  };

  await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2));

  return {
    tableCounts: {
      users: users.length,
      organizations: organizations.length,
      organizationMembers: organizationMembers.length,
      organizationDomains: organizationDomains.length,
      organizationScimTokens: organizationScimTokens.length,
      organizationScimIdentities: organizationScimIdentities.length,
      organizationScimGroups: organizationScimGroups.length,
      organizationScimGroupMembers: organizationScimGroupMembers.length,
      workspaces: workspaces.length,
      workspaceMembers: workspaceMembers.length,
      workspaceScimGroupMappings: workspaceScimGroupMappings.length,
      workspaceScimProvisionedMembers: workspaceScimProvisionedMembers.length,
      pages: pages.length,
      pageEmbeddingChunks: pageEmbeddingChunks.length,
      searchIndexJobs: searchIndexJobs.length,
      pagePermissions: pagePermissions.length,
      pageShareLinks: pageShareLinks.length,
      backlinks: backlinks.length,
      comments: comments.length,
      attachments: attachments.length,
      favorites: favorites.length,
      aiChats: aiChats.length,
      auditLogs: auditLogs.length,
      retentionRuns: retentionRuns.length,
      retentionRunWorkspaces: retentionRunWorkspaces.length,
      backupRuns: backupRuns.length,
      backupArtifacts: backupArtifacts.length,
      restoreDrillRuns: restoreDrillRuns.length,
      searchIndexWorkerRuns: searchIndexWorkerRuns.length,
      searchIndexWorkerRunWorkspaces: searchIndexWorkerRunWorkspaces.length,
      workspaceSettings: workspaceSettings.length,
    },
  };
}

async function resolveDatabaseStrategy(config: ReturnType<typeof getBackupConfig>) {
  const pgDumpAvailable = await isCommandAvailable(config.pgDumpBin);

  if (config.databaseStrategy === "pg_dump") {
    if (!pgDumpAvailable) {
      throw new Error(
        `BACKUP_DATABASE_STRATEGY=pg_dump but ${config.pgDumpBin} is not available`
      );
    }

    return "pg_dump" as const;
  }

  if (config.databaseStrategy === "logical_json") {
    return "logical_json" as const;
  }

  return pgDumpAvailable ? ("pg_dump" as const) : ("logical_json" as const);
}

async function archiveDirectory(
  tarBin: string,
  sourceDir: string,
  destinationFile: string
) {
  const parentDir = path.dirname(sourceDir);
  const baseName = path.basename(sourceDir);
  await runCommand(tarBin, ["-czf", destinationFile, "-C", parentDir, baseName]);

  const entries = await fs.promises.readdir(sourceDir);
  return { topLevelEntryCount: entries.length };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const trigger = readFlag("--trigger") || process.env.BACKUP_TRIGGER || "manual";
  const now = new Date();
  const config = getBackupConfig();
  const databaseStrategy = await resolveDatabaseStrategy(config);
  const warnings: string[] = [];

  const run = await prisma.backupRun.create({
    data: {
      mode: dryRun ? "dry_run" : "execute",
      trigger,
      backupRootDir: config.backupRootDir,
      config: toJsonValue({
        ...config,
        resolvedDatabaseStrategy: databaseStrategy,
      }),
    },
    select: { id: true },
  });
  backupRunId = run.id;

  logInfo("backup.run.started", {
    backupRunId: run.id,
    mode: dryRun ? "dry_run" : "execute",
    trigger,
    backupRootDir: config.backupRootDir,
    databaseStrategy,
  });

  const plannedArtifacts: BackupArtifactManifestEntry[] = [];
  const artifactRows: BackupArtifactManifestEntry[] = [];
  let totalBytes = "0";
  let destinationPath: string | null = null;

  plannedArtifacts.push({
    kind: databaseStrategy === "pg_dump" ? "postgres_dump" : "database_export",
    status: dryRun ? "planned" : "created",
    filePath: dryRun
      ? path.join(
          config.backupRootDir,
          `${formatBackupStamp(now)}-${run.id.slice(0, 8)}`,
          databaseStrategy === "pg_dump" ? "postgres.sql" : "database.json"
        )
      : null,
    sizeBytes: null,
    checksumSha256: null,
    metadata: { databaseStrategy },
  });

  const sourcePlans = [
    {
      enabled: config.includeRepos,
      kind: "repos_archive",
      sourceDir: config.reposDir,
      fileName: "repos.tar.gz",
    },
    {
      enabled: config.includeUploads,
      kind: "uploads_archive",
      sourceDir: config.uploadsDir,
      fileName: "uploads.tar.gz",
      skipIf: process.env.STORAGE_TYPE === "s3",
      skipReason: "storage_type_s3",
    },
    {
      enabled: config.includeYjs,
      kind: "yjs_archive",
      sourceDir: config.yjsDir,
      fileName: "yjs.tar.gz",
    },
  ];

  for (const plan of sourcePlans) {
    if (!plan.enabled) {
      plannedArtifacts.push({
        kind: plan.kind,
        status: "skipped",
        filePath: null,
        sizeBytes: null,
        checksumSha256: null,
        metadata: { reason: "disabled" },
      });
      continue;
    }

    if (plan.skipIf) {
      warnings.push(`${plan.kind} skipped because ${plan.skipReason}`);
      plannedArtifacts.push({
        kind: plan.kind,
        status: "skipped",
        filePath: null,
        sizeBytes: null,
        checksumSha256: null,
        metadata: { reason: plan.skipReason },
      });
      continue;
    }

    const sourceStats = await statPath(plan.sourceDir);
    if (!sourceStats?.isDirectory()) {
      warnings.push(`${plan.kind} source directory is missing: ${plan.sourceDir}`);
      plannedArtifacts.push({
        kind: plan.kind,
        status: "skipped",
        filePath: null,
        sizeBytes: null,
        checksumSha256: null,
        metadata: { reason: "missing_source", sourceDir: plan.sourceDir },
      });
      continue;
    }

    plannedArtifacts.push({
      kind: plan.kind,
      status: dryRun ? "planned" : "created",
      filePath: dryRun
        ? path.join(
            config.backupRootDir,
            `${formatBackupStamp(now)}-${run.id.slice(0, 8)}`,
            plan.fileName
          )
        : null,
      sizeBytes: null,
      checksumSha256: null,
      metadata: { sourceDir: plan.sourceDir },
    });
  }

  if (!dryRun) {
    destinationPath = path.join(
      config.backupRootDir,
      `${formatBackupStamp(now)}-${run.id.slice(0, 8)}`
    );
    await ensureDir(destinationPath);

    const databaseFilePath = path.join(
      destinationPath,
      databaseStrategy === "pg_dump" ? "postgres.sql" : "database.json"
    );

    if (databaseStrategy === "pg_dump") {
      if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is required for pg_dump backups");
      }

      await runCommand(config.pgDumpBin, [
        "--file",
        databaseFilePath,
        "--no-owner",
        "--no-privileges",
        process.env.DATABASE_URL,
      ]);
      const artifact = await captureFileArtifact("postgres_dump", databaseFilePath, {
        databaseStrategy,
      });
      artifactRows.push(artifact);
      totalBytes = addBytes(totalBytes, artifact.sizeBytes);
    } else {
      const exportSummary = await exportDatabaseToLogicalJson(databaseFilePath);
      const artifact = await captureFileArtifact("database_export", databaseFilePath, {
        databaseStrategy,
        ...exportSummary,
      });
      artifactRows.push(artifact);
      totalBytes = addBytes(totalBytes, artifact.sizeBytes);
    }

    for (const plan of sourcePlans) {
      if (!plan.enabled) {
        artifactRows.push({
          kind: plan.kind,
          status: "skipped",
          filePath: null,
          sizeBytes: null,
          checksumSha256: null,
          metadata: { reason: "disabled" },
        });
        continue;
      }

      if (plan.skipIf) {
        artifactRows.push({
          kind: plan.kind,
          status: "skipped",
          filePath: null,
          sizeBytes: null,
          checksumSha256: null,
          metadata: { reason: plan.skipReason },
        });
        continue;
      }

      const sourceStats = await statPath(plan.sourceDir);
      if (!sourceStats?.isDirectory()) {
        artifactRows.push({
          kind: plan.kind,
          status: "skipped",
          filePath: null,
          sizeBytes: null,
          checksumSha256: null,
          metadata: { reason: "missing_source", sourceDir: plan.sourceDir },
        });
        continue;
      }

      const archivePath = path.join(destinationPath, plan.fileName);
      const archiveSummary = await archiveDirectory(config.tarBin, plan.sourceDir, archivePath);
      const artifact = await captureFileArtifact(plan.kind, archivePath, {
        sourceDir: plan.sourceDir,
        ...archiveSummary,
      });
      artifactRows.push(artifact);
      totalBytes = addBytes(totalBytes, artifact.sizeBytes);
    }

    const manifestPayload = {
      version: 1,
      backupRunId: run.id,
      generatedAt: new Date().toISOString(),
      trigger,
      mode: "execute",
      destinationPath,
      backupRootDir: config.backupRootDir,
      databaseStrategy,
      warnings,
      artifacts: artifactRows,
    };
    const manifestFilePath = path.join(destinationPath, "manifest.json");
    await fs.promises.writeFile(
      manifestFilePath,
      JSON.stringify(manifestPayload, null, 2)
    );

    const manifestArtifact = await captureFileArtifact("manifest", manifestFilePath, {
      artifactCount: artifactRows.filter((artifact) => artifact.status === "created").length,
    });
    artifactRows.push(manifestArtifact);
    totalBytes = addBytes(totalBytes, manifestArtifact.sizeBytes);

    const summary: BackupSummary = {
      databaseStrategy,
      artifactCount: artifactRows.filter((artifact) => artifact.status === "created").length,
      skippedArtifactCount: artifactRows.filter((artifact) => artifact.status === "skipped").length,
      totalBytes,
      warnings,
    };

    await prisma.$transaction(async (tx) => {
      await tx.backupArtifact.createMany({
        data: artifactRows.map((artifact) => ({
          backupRunId: run.id,
          kind: artifact.kind,
          status: artifact.status,
          filePath: artifact.filePath,
          sizeBytes: artifact.sizeBytes,
          checksumSha256: artifact.checksumSha256,
          metadata: artifact.metadata ? toJsonValue(artifact.metadata) : undefined,
        })),
      });

      await tx.backupRun.update({
        where: { id: run.id },
        data: {
          status: "success",
          destinationPath,
          summary: toJsonValue(summary),
          manifest: toJsonValue({
            version: 1,
            artifacts: artifactRows,
            warnings,
            databaseStrategy,
          }),
          finishedAt: new Date(),
        },
      });
    });

    logInfo("backup.run.completed", {
      backupRunId: run.id,
      mode: "execute",
      trigger,
      destinationPath,
      summary,
    });

    console.log(
      JSON.stringify(
        {
          backupRunId: run.id,
          dryRun: false,
          trigger,
          destinationPath,
          summary,
          artifacts: artifactRows,
        },
        null,
        2
      )
    );
    return;
  }

  const summary: BackupSummary = {
    databaseStrategy,
    artifactCount: plannedArtifacts.filter((artifact) => artifact.status === "planned").length,
    skippedArtifactCount: plannedArtifacts.filter((artifact) => artifact.status === "skipped").length,
    totalBytes: "0",
    warnings,
  };

  await prisma.backupRun.update({
    where: { id: run.id },
    data: {
      status: "success",
      summary: toJsonValue(summary),
      manifest: toJsonValue({
        version: 1,
        artifacts: plannedArtifacts,
        warnings,
        databaseStrategy,
      }),
      finishedAt: new Date(),
    },
  });

  logInfo("backup.run.completed", {
    backupRunId: run.id,
    mode: "dry_run",
    trigger,
    summary,
  });

  console.log(
    JSON.stringify(
      {
        backupRunId: run.id,
        dryRun: true,
        trigger,
        destinationPath,
        summary,
        artifacts: plannedArtifacts,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    logError("backup.run.failed", error, { backupRunId });
    if (backupRunId) {
      prisma.backupRun
        .update({
          where: { id: backupRunId },
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
