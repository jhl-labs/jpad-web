import { prisma } from "@/lib/prisma";
import {
  DEFAULT_AI_TASK_ROUTING,
  WorkspaceAiProfile,
  WorkspaceAiTaskRouting,
} from "@/lib/aiConfig";
import {
  normalizeAiProfilesFromStorage,
  normalizeAiTaskRoutingFromStorage,
} from "@/lib/aiSettings";
import type { UploadDlpScanMode } from "@/lib/uploadDlp";

export const DEFAULT_WORKSPACE_SETTINGS = {
  aiEnabled: true,
  aiModel: "claude-sonnet-4-20250514",
  aiApiKey: null as string | null,
  aiMaxTokens: 2048,
  aiProfiles: [] as WorkspaceAiProfile[],
  aiTaskRouting: { ...DEFAULT_AI_TASK_ROUTING } as WorkspaceAiTaskRouting,
  allowPublicPages: true,
  allowMemberInvite: true,
  defaultPageAccess: "workspace" as "workspace" | "restricted",
  maxFileUploadMb: 10,
  uploadDlpScanMode: null as UploadDlpScanMode | null,
  uploadDlpDetectors: null as string[] | null,
  uploadDlpMaxExtractedCharacters: null as number | null,
};

export type EffectiveWorkspaceSettings = typeof DEFAULT_WORKSPACE_SETTINGS & {
  workspaceId: string;
};

function normalizeDefaultPageAccess(
  value: string | null | undefined
): "workspace" | "restricted" {
  return value === "restricted" ? "restricted" : "workspace";
}

function normalizeMaxFileUploadMb(value: number | null | undefined): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 10;
  return Math.min(100, Math.max(1, Math.floor(value)));
}

const VALID_DLP_SCAN_MODES: UploadDlpScanMode[] = ["off", "best_effort", "required"];

function normalizeDlpScanMode(
  value: string | null | undefined
): UploadDlpScanMode | null {
  if (!value) return null;
  return VALID_DLP_SCAN_MODES.includes(value as UploadDlpScanMode)
    ? (value as UploadDlpScanMode)
    : null;
}

function normalizeDlpDetectors(
  value: unknown
): string[] | null {
  if (!Array.isArray(value)) return null;
  const filtered = value.filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0
  );
  return filtered.length > 0 ? filtered : null;
}

function normalizeDlpMaxChars(
  value: number | null | undefined
): number | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return Math.min(500_000, Math.max(1_000, Math.floor(value)));
}

export async function getEffectiveWorkspaceSettings(
  workspaceId: string
): Promise<EffectiveWorkspaceSettings> {
  const settings = await prisma.workspaceSettings.findUnique({
    where: { workspaceId },
  });
  const persisted = settings
    ? {
        aiEnabled: settings.aiEnabled,
        aiModel: settings.aiModel,
        aiApiKey: settings.aiApiKey,
        aiMaxTokens: settings.aiMaxTokens,
        aiProfiles: normalizeAiProfilesFromStorage(settings.aiProfiles, {
          aiModel: settings.aiModel,
          aiApiKey: settings.aiApiKey,
          aiMaxTokens: settings.aiMaxTokens,
        }),
        allowPublicPages: settings.allowPublicPages,
        allowMemberInvite: settings.allowMemberInvite,
      }
    : {};

  const aiProfiles = settings
    ? normalizeAiProfilesFromStorage(settings.aiProfiles, {
        aiModel: settings.aiModel,
        aiApiKey: settings.aiApiKey,
        aiMaxTokens: settings.aiMaxTokens,
      })
    : DEFAULT_WORKSPACE_SETTINGS.aiProfiles;
  const aiTaskRouting = settings
    ? normalizeAiTaskRoutingFromStorage(settings.aiTaskRouting, aiProfiles)
    : DEFAULT_WORKSPACE_SETTINGS.aiTaskRouting;

  return {
    ...DEFAULT_WORKSPACE_SETTINGS,
    ...persisted,
    workspaceId,
    aiProfiles,
    aiTaskRouting,
    defaultPageAccess: normalizeDefaultPageAccess(settings?.defaultPageAccess),
    maxFileUploadMb: normalizeMaxFileUploadMb(settings?.maxFileUploadMb),
    uploadDlpScanMode: normalizeDlpScanMode(settings?.uploadDlpScanMode),
    uploadDlpDetectors: normalizeDlpDetectors(settings?.uploadDlpDetectors),
    uploadDlpMaxExtractedCharacters: normalizeDlpMaxChars(
      settings?.uploadDlpMaxExtractedCharacters
    ),
  };
}
