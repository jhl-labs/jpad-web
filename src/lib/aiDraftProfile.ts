import { AI_SECRET_MASK, WorkspaceAiProfile } from "@/lib/aiConfig";
import { parseAiProfileInput } from "@/lib/aiSettings";
import { getEffectiveWorkspaceSettings } from "@/lib/workspaceSettings";

export async function resolveWorkspaceDraftAiProfile(
  workspaceId: string,
  rawProfile: unknown,
  actorRole: string
): Promise<WorkspaceAiProfile> {
  const effective = await getEffectiveWorkspaceSettings(workspaceId);
  const parsedProfile = parseAiProfileInput(rawProfile);
  const existingProfile = effective.aiProfiles.find(
    (profile) => profile.id === parsedProfile.id
  );

  const rawApiKey =
    rawProfile && typeof rawProfile === "object"
      ? (rawProfile as { apiKey?: unknown }).apiKey
      : undefined;

  if (
    actorRole !== "owner" &&
    typeof rawApiKey === "string" &&
    rawApiKey.trim() !== "" &&
    rawApiKey !== AI_SECRET_MASK
  ) {
    throw new Error("Only owners can provide new AI API keys");
  }

  return {
    ...parsedProfile,
    apiKey:
      parsedProfile.apiKey === AI_SECRET_MASK
        ? existingProfile?.apiKey || null
        : parsedProfile.apiKey,
  };
}
