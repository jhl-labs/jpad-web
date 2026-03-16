import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, checkWorkspaceAccess } from "@/lib/auth/helpers";
import { createAuditActor, getAuditRequestContext, recordAuditLog } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { encryptSecret, SecretEncryptionError } from "@/lib/secrets";
import { AI_SECRET_MASK } from "@/lib/aiConfig";
import {
  getDefaultAiProfilesFromLegacy,
  maskAiProfiles,
  mergeAndEncryptAiProfiles,
  normalizeAiProfilesFromStorage,
  normalizeAiTaskRoutingFromStorage,
  resolveAiProfileForTask,
} from "@/lib/aiSettings";
import { getEffectiveWorkspaceSettings } from "@/lib/workspaceSettings";

class SettingsValidationError extends Error {}

function hasUnmaskedProfileSecret(value: unknown) {
  if (!Array.isArray(value)) return false;

  return value.some((profile) => {
    if (!profile || typeof profile !== "object") return false;
    const apiKey = (profile as { apiKey?: unknown }).apiKey;
    return (
      typeof apiKey === "string" &&
      apiKey.trim() !== "" &&
      apiKey !== AI_SECRET_MASK
    );
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const user = await requireAuth();
    const { workspaceId } = await params;

    const member = await checkWorkspaceAccess(user.id, workspaceId, [
      "owner",
      "admin",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let settings = await prisma.workspaceSettings.findUnique({
      where: { workspaceId },
    });

    if (!settings) {
      settings = await prisma.workspaceSettings.create({
        data: { workspaceId },
      });
    }

    const effective = await getEffectiveWorkspaceSettings(workspaceId);
    return NextResponse.json({
      ...effective,
      aiApiKey: effective.aiApiKey ? AI_SECRET_MASK : null,
      aiProfiles: maskAiProfiles(effective.aiProfiles),
      googleCalendarClientId: settings?.googleCalendarClientId || null,
      googleCalendarClientSecret: settings?.googleCalendarClientSecret
        ? AI_SECRET_MASK
        : null,
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
) {
  try {
    const user = await requireAuth();
    const { workspaceId } = await params;
    const requestContext = getAuditRequestContext(req);

    const member = await checkWorkspaceAccess(user.id, workspaceId, [
      "owner",
      "admin",
    ]);
    if (!member) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updateData: Record<string, unknown> = {};
    const body = await req.json();
    const updatedFields: string[] = [];
    let secretFieldsChanged = false;

    const existingSettings = await prisma.workspaceSettings.findUnique({
      where: { workspaceId },
    });
    const legacySettings = existingSettings
      ? {
          aiModel: existingSettings.aiModel,
          aiApiKey: existingSettings.aiApiKey,
          aiMaxTokens: existingSettings.aiMaxTokens,
        }
      : {
          aiModel: "claude-sonnet-4-20250514",
          aiApiKey: null,
          aiMaxTokens: 2048,
        };
    const existingProfiles = existingSettings
      ? normalizeAiProfilesFromStorage(existingSettings.aiProfiles, legacySettings)
      : getDefaultAiProfilesFromLegacy(legacySettings);

    if ("aiEnabled" in body) {
      if (typeof body.aiEnabled !== "boolean") {
        throw new SettingsValidationError("aiEnabled must be a boolean");
      }
      updateData.aiEnabled = body.aiEnabled;
      updatedFields.push("aiEnabled");
    }

    if ("aiModel" in body) {
      if (typeof body.aiModel !== "string" || !body.aiModel.trim()) {
        throw new SettingsValidationError("aiModel must be a non-empty string");
      }
      updateData.aiModel = body.aiModel.trim();
      updatedFields.push("aiModel");
    }

    if ("aiApiKey" in body && member.role === "owner") {
      if (body.aiApiKey === null || body.aiApiKey === "") {
        updateData.aiApiKey = null;
      } else if (typeof body.aiApiKey === "string") {
        updateData.aiApiKey = encryptSecret(body.aiApiKey.trim());
      } else {
        throw new SettingsValidationError("aiApiKey must be a string or null");
      }
      updatedFields.push("aiApiKey");
      secretFieldsChanged = true;
    } else if ("aiApiKey" in body && member.role !== "owner") {
      throw new SettingsValidationError("Only owners can update AI API keys");
    }

    if ("aiMaxTokens" in body) {
      if (
        typeof body.aiMaxTokens !== "number" ||
        Number.isNaN(body.aiMaxTokens) ||
        !Number.isInteger(body.aiMaxTokens)
      ) {
        throw new SettingsValidationError("aiMaxTokens must be an integer");
      }
      updateData.aiMaxTokens = Math.min(8192, Math.max(1, body.aiMaxTokens));
      updatedFields.push("aiMaxTokens");
    }

    let normalizedProfiles = existingProfiles;
    if ("aiProfiles" in body) {
      if (member.role !== "owner" && hasUnmaskedProfileSecret(body.aiProfiles)) {
        throw new SettingsValidationError("Only owners can update AI profile API keys");
      }

      normalizedProfiles = mergeAndEncryptAiProfiles(body.aiProfiles, existingProfiles);
      updateData.aiProfiles = normalizedProfiles;
      updatedFields.push("aiProfiles");
      if (hasUnmaskedProfileSecret(body.aiProfiles)) {
        secretFieldsChanged = true;
      }
    }

    if ("aiTaskRouting" in body) {
      updateData.aiTaskRouting = normalizeAiTaskRoutingFromStorage(
        body.aiTaskRouting,
        normalizedProfiles
      );
      updatedFields.push("aiTaskRouting");
    }

    const nextRouting =
      (updateData.aiTaskRouting as ReturnType<typeof normalizeAiTaskRoutingFromStorage>) ||
      normalizeAiTaskRoutingFromStorage(existingSettings?.aiTaskRouting, normalizedProfiles);
    const defaultProfile = resolveAiProfileForTask(
      normalizedProfiles,
      nextRouting,
      "general"
    );
    if (defaultProfile) {
      updateData.aiModel = defaultProfile.model || legacySettings.aiModel;
      updateData.aiApiKey =
        typeof updateData.aiApiKey === "undefined"
          ? defaultProfile.apiKey
          : updateData.aiApiKey;
      updateData.aiMaxTokens =
        defaultProfile.maxTokens || (updateData.aiMaxTokens as number) || legacySettings.aiMaxTokens;
    }

    if ("allowPublicPages" in body) {
      if (typeof body.allowPublicPages !== "boolean") {
        throw new SettingsValidationError("allowPublicPages must be a boolean");
      }
      updateData.allowPublicPages = body.allowPublicPages;
      updatedFields.push("allowPublicPages");
    }

    if ("allowMemberInvite" in body) {
      if (typeof body.allowMemberInvite !== "boolean") {
        throw new SettingsValidationError("allowMemberInvite must be a boolean");
      }
      updateData.allowMemberInvite = body.allowMemberInvite;
      updatedFields.push("allowMemberInvite");
    }

    if ("defaultPageAccess" in body) {
      if (!["workspace", "restricted"].includes(body.defaultPageAccess)) {
        throw new SettingsValidationError(
          "defaultPageAccess must be either workspace or restricted"
        );
      }
      updateData.defaultPageAccess = body.defaultPageAccess;
      updatedFields.push("defaultPageAccess");
    }

    if ("maxFileUploadMb" in body) {
      if (
        typeof body.maxFileUploadMb !== "number" ||
        Number.isNaN(body.maxFileUploadMb) ||
        !Number.isInteger(body.maxFileUploadMb)
      ) {
        throw new SettingsValidationError("maxFileUploadMb must be an integer");
      }
      updateData.maxFileUploadMb = Math.min(100, Math.max(1, body.maxFileUploadMb));
      updatedFields.push("maxFileUploadMb");
    }

    if ("uploadDlpScanMode" in body) {
      if (
        body.uploadDlpScanMode !== null &&
        !["off", "best_effort", "required"].includes(body.uploadDlpScanMode)
      ) {
        throw new SettingsValidationError(
          "uploadDlpScanMode must be off, best_effort, required, or null"
        );
      }
      updateData.uploadDlpScanMode = body.uploadDlpScanMode || null;
      updatedFields.push("uploadDlpScanMode");
    }

    if ("uploadDlpDetectors" in body) {
      if (body.uploadDlpDetectors !== null && !Array.isArray(body.uploadDlpDetectors)) {
        throw new SettingsValidationError("uploadDlpDetectors must be an array or null");
      }
      if (Array.isArray(body.uploadDlpDetectors)) {
        const valid = body.uploadDlpDetectors.every(
          (d: unknown) => typeof d === "string" && d.trim().length > 0
        );
        if (!valid) {
          throw new SettingsValidationError(
            "uploadDlpDetectors must contain non-empty strings"
          );
        }
      }
      updateData.uploadDlpDetectors = body.uploadDlpDetectors || null;
      updatedFields.push("uploadDlpDetectors");
    }

    if ("uploadDlpMaxExtractedCharacters" in body) {
      if (
        body.uploadDlpMaxExtractedCharacters !== null &&
        (typeof body.uploadDlpMaxExtractedCharacters !== "number" ||
          !Number.isInteger(body.uploadDlpMaxExtractedCharacters))
      ) {
        throw new SettingsValidationError(
          "uploadDlpMaxExtractedCharacters must be an integer or null"
        );
      }
      updateData.uploadDlpMaxExtractedCharacters =
        body.uploadDlpMaxExtractedCharacters !== null
          ? Math.min(500_000, Math.max(1_000, body.uploadDlpMaxExtractedCharacters))
          : null;
      updatedFields.push("uploadDlpMaxExtractedCharacters");
    }

    if ("googleCalendarClientId" in body) {
      if (
        body.googleCalendarClientId !== null &&
        (typeof body.googleCalendarClientId !== "string" ||
          !body.googleCalendarClientId.trim())
      ) {
        throw new SettingsValidationError(
          "googleCalendarClientId must be a non-empty string or null"
        );
      }
      updateData.googleCalendarClientId =
        body.googleCalendarClientId?.trim() || null;
      updatedFields.push("googleCalendarClientId");
    }

    if ("googleCalendarClientSecret" in body && member.role === "owner") {
      if (body.googleCalendarClientSecret === null || body.googleCalendarClientSecret === "") {
        updateData.googleCalendarClientSecret = null;
      } else if (typeof body.googleCalendarClientSecret === "string") {
        if (body.googleCalendarClientSecret !== AI_SECRET_MASK) {
          updateData.googleCalendarClientSecret = encryptSecret(
            body.googleCalendarClientSecret.trim()
          );
          secretFieldsChanged = true;
        }
      } else {
        throw new SettingsValidationError(
          "googleCalendarClientSecret must be a string or null"
        );
      }
      updatedFields.push("googleCalendarClientSecret");
    } else if ("googleCalendarClientSecret" in body && member.role !== "owner") {
      throw new SettingsValidationError(
        "Only owners can update Google Calendar client secret"
      );
    }

    await prisma.workspaceSettings.upsert({
      where: { workspaceId },
      create: { workspaceId, ...updateData },
      update: updateData,
    });

    if (updatedFields.length > 0) {
      await recordAuditLog({
        action: "workspace.settings.updated",
        actor: createAuditActor(user, member.role),
        workspaceId,
        targetId: workspaceId,
        targetType: "workspace",
        metadata: {
          updatedFields: updatedFields.filter((field) => field !== "aiApiKey"),
          secretFieldsChanged,
        },
        context: requestContext,
      });
    }

    const effective = await getEffectiveWorkspaceSettings(workspaceId);
    return NextResponse.json({
      ...effective,
      aiApiKey: effective.aiApiKey ? AI_SECRET_MASK : null,
      aiProfiles: maskAiProfiles(effective.aiProfiles),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof SettingsValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof SecretEncryptionError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    logError("settings.patch.unhandled_error", error, {}, req);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
