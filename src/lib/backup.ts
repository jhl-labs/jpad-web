import path from "node:path";

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  min = 1,
  max = 100
): number {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

export type BackupDatabaseStrategy = "auto" | "pg_dump" | "logical_json";

export interface BackupConfig {
  backupRootDir: string;
  reposDir: string;
  uploadsDir: string;
  yjsDir: string;
  includeRepos: boolean;
  includeUploads: boolean;
  includeYjs: boolean;
  databaseStrategy: BackupDatabaseStrategy;
  pgDumpBin: string;
  tarBin: string;
  gitBin: string;
  restoreDrillRepoSampleLimit: number;
}

export interface BackupArtifactManifestEntry {
  kind: string;
  status: "created" | "skipped" | "planned";
  filePath: string | null;
  sizeBytes: string | null;
  checksumSha256: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface BackupSummary {
  databaseStrategy: Exclude<BackupDatabaseStrategy, "auto">;
  artifactCount: number;
  skippedArtifactCount: number;
  totalBytes: string;
  warnings: string[];
}

export interface RestoreDrillSummary {
  verifiedArtifactCount: number;
  checksumVerifiedCount: number;
  archiveVerifiedCount: number;
  sampledRepoCount: number;
  repoFsckPassedCount: number;
  warnings: string[];
  artifactResults: Array<{
    kind: string;
    filePath: string | null;
    status: "verified" | "skipped";
    details?: Record<string, unknown>;
  }>;
}

export function getBackupConfig(): BackupConfig {
  const strategy = (process.env.BACKUP_DATABASE_STRATEGY || "auto").trim();

  return {
    backupRootDir: path.resolve(
      process.cwd(),
      process.env.BACKUP_ROOT_DIR || "data/backups"
    ),
    reposDir: path.resolve(process.cwd(), process.env.BACKUP_REPOS_DIR || "data/repos"),
    uploadsDir: path.resolve(
      process.cwd(),
      process.env.BACKUP_UPLOADS_DIR || "data/uploads"
    ),
    yjsDir: path.resolve(process.cwd(), process.env.BACKUP_YJS_DIR || "data/yjs"),
    includeRepos: parseBoolean(process.env.BACKUP_INCLUDE_REPOS, true),
    includeUploads: parseBoolean(process.env.BACKUP_INCLUDE_UPLOADS, true),
    includeYjs: parseBoolean(process.env.BACKUP_INCLUDE_YJS, true),
    databaseStrategy:
      strategy === "pg_dump" || strategy === "logical_json" ? strategy : "auto",
    pgDumpBin: process.env.BACKUP_PG_DUMP_BIN || "pg_dump",
    tarBin: process.env.BACKUP_TAR_BIN || "tar",
    gitBin: process.env.BACKUP_GIT_BIN || "git",
    restoreDrillRepoSampleLimit: parsePositiveInt(
      process.env.RESTORE_DRILL_REPO_SAMPLE_LIMIT,
      3,
      1,
      20
    ),
  };
}

export function formatBackupStamp(date: Date): string {
  const iso = date.toISOString().replace(/[-:]/g, "");
  return iso.replace(/\.\d{3}Z$/, "Z");
}
