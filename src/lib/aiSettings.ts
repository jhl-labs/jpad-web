import { z } from "zod";
import {
  AI_PROVIDER_VALUES,
  AI_SECRET_MASK,
  AI_TASK_VALUES,
  DEFAULT_AI_TASK_ROUTING,
  WorkspaceAiProfile,
  WorkspaceAiTaskRouting,
  buildDefaultAiProfile,
} from "@/lib/aiConfig";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

const profileSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  provider: z.enum(AI_PROVIDER_VALUES),
  enabled: z.boolean().default(true),
  model: z.string().max(200).default(""),
  apiKey: z.string().nullable().optional(),
  baseUrl: z.string().max(500).nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  topP: z.number().min(0).max(1).nullable().optional(),
  topK: z.number().int().min(1).max(500).nullable().optional(),
  maxTokens: z.number().int().min(1).max(200000).nullable().optional(),
  presencePenalty: z.number().min(-2).max(2).nullable().optional(),
  frequencyPenalty: z.number().min(-2).max(2).nullable().optional(),
  repeatPenalty: z.number().min(0).max(5).nullable().optional(),
  seed: z.number().int().min(0).max(2147483647).nullable().optional(),
  stop: z.array(z.string().min(1).max(100)).max(8).optional(),
});

const routingSchema = z.object({
  general: z.string().nullable().optional(),
  write: z.string().nullable().optional(),
  chat: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  autocomplete: z.string().nullable().optional(),
  embedding: z.string().nullable().optional(),
});

function normalizeString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function normalizeUrl(value: string | null | undefined) {
  const normalized = normalizeString(value, 500);
  return normalized || null;
}

function normalizeStopSequences(value: string[] | undefined) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeString(item, 100))
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeProfile(profile: z.infer<typeof profileSchema>): WorkspaceAiProfile {
  return {
    id: normalizeString(profile.id, 120),
    name: normalizeString(profile.name, 120),
    provider: profile.provider,
    enabled: profile.enabled,
    model: normalizeString(profile.model, 200),
    apiKey: typeof profile.apiKey === "string" ? profile.apiKey.trim() || null : null,
    baseUrl: normalizeUrl(profile.baseUrl),
    temperature: profile.temperature ?? null,
    topP: profile.topP ?? null,
    topK: profile.topK ?? null,
    maxTokens: profile.maxTokens ?? null,
    presencePenalty: profile.presencePenalty ?? null,
    frequencyPenalty: profile.frequencyPenalty ?? null,
    repeatPenalty: profile.repeatPenalty ?? null,
    seed: profile.seed ?? null,
    stop: normalizeStopSequences(profile.stop),
  };
}

export function parseAiProfileInput(value: unknown) {
  const parsed = profileSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message || "Invalid AI profile");
  }

  return normalizeProfile(parsed.data);
}

export function getDefaultAiProfilesFromLegacy(legacy: {
  aiModel: string;
  aiApiKey: string | null;
  aiMaxTokens: number;
}) {
  return [
    buildDefaultAiProfile({
      id: "legacy-anthropic",
      name: "Legacy Anthropic",
      provider: "anthropic",
      model: legacy.aiModel,
      apiKey: legacy.aiApiKey,
      maxTokens: legacy.aiMaxTokens,
    }),
  ];
}

export function normalizeAiProfilesFromStorage(
  storedValue: unknown,
  legacy: {
    aiModel: string;
    aiApiKey: string | null;
    aiMaxTokens: number;
  }
): WorkspaceAiProfile[] {
  if (!Array.isArray(storedValue)) {
    return getDefaultAiProfilesFromLegacy(legacy);
  }

  const normalized = storedValue
    .map((entry) => profileSchema.safeParse(entry))
    .filter((entry) => entry.success)
    .map((entry) => normalizeProfile(entry.data));

  if (normalized.length === 0) {
    return getDefaultAiProfilesFromLegacy(legacy);
  }

  return normalized;
}

export function normalizeAiTaskRoutingFromStorage(
  storedValue: unknown,
  profiles: WorkspaceAiProfile[]
): WorkspaceAiTaskRouting {
  const firstEnabledProfile = profiles.find((profile) => profile.enabled) || profiles[0];
  const parsed = routingSchema.safeParse(storedValue);
  const baseRouting = parsed.success ? parsed.data : DEFAULT_AI_TASK_ROUTING;
  const validIds = new Set(profiles.map((profile) => profile.id));

  const routing = { ...DEFAULT_AI_TASK_ROUTING } as WorkspaceAiTaskRouting;

  for (const task of AI_TASK_VALUES) {
    const configuredId = baseRouting[task];
    routing[task] =
      configuredId && validIds.has(configuredId) ? configuredId : null;
  }

  if (!routing.general && firstEnabledProfile) {
    routing.general = firstEnabledProfile.id;
  }

  return routing;
}

export function maskAiProfiles(profiles: WorkspaceAiProfile[]) {
  return profiles.map((profile) => ({
    ...profile,
    apiKey: profile.apiKey ? AI_SECRET_MASK : null,
  }));
}

export function mergeAndEncryptAiProfiles(
  incomingValue: unknown,
  existingProfiles: WorkspaceAiProfile[]
) {
  if (!Array.isArray(incomingValue)) {
    throw new Error("aiProfiles must be an array");
  }

  const existingById = new Map(existingProfiles.map((profile) => [profile.id, profile]));

  return incomingValue.map((entry) => {
    const parsed = profileSchema.safeParse(entry);
    if (!parsed.success) {
      throw new Error(parsed.error.issues[0]?.message || "Invalid AI profile");
    }

    const normalized = normalizeProfile(parsed.data);
    const existing = existingById.get(normalized.id);
    const apiKeyInput =
      typeof parsed.data.apiKey === "undefined" ? AI_SECRET_MASK : parsed.data.apiKey;

    let apiKey = existing?.apiKey || null;
    if (apiKeyInput === null || apiKeyInput === "") {
      apiKey = null;
    } else if (apiKeyInput !== AI_SECRET_MASK) {
      apiKey = encryptSecret(apiKeyInput.trim());
    }

    return {
      ...normalized,
      apiKey,
    };
  });
}

export function getResolvedApiKeyForProfile(profile: WorkspaceAiProfile) {
  const workspaceApiKey = decryptSecret(profile.apiKey);
  if (workspaceApiKey) return workspaceApiKey;

  switch (profile.provider) {
    case "anthropic":
      return process.env.ANTHROPIC_API_KEY || null;
    case "openai":
    case "openai-compatible":
      return process.env.OPENAI_API_KEY || null;
    case "gemini":
      return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null;
    case "ollama":
      return process.env.OLLAMA_API_KEY || null;
    default:
      return null;
  }
}

export function getResolvedBaseUrl(profile: WorkspaceAiProfile) {
  if (profile.baseUrl) return profile.baseUrl;

  switch (profile.provider) {
    case "anthropic":
      return "https://api.anthropic.com";
    case "openai":
      return "https://api.openai.com";
    case "gemini":
      return "https://generativelanguage.googleapis.com";
    case "openai-compatible":
      return "https://api.openai.com";
    case "ollama":
      return "http://localhost:11434";
    default:
      return "";
  }
}

export function resolveAiProfileForTask(
  profiles: WorkspaceAiProfile[],
  routing: WorkspaceAiTaskRouting,
  task: keyof WorkspaceAiTaskRouting
) {
  const enabledProfiles = profiles.filter((profile) => profile.enabled);
  const byId = new Map(enabledProfiles.map((profile) => [profile.id, profile]));
  const taskProfile =
    (routing[task] && byId.get(routing[task] as string)) ||
    (routing.general && byId.get(routing.general)) ||
    enabledProfiles[0] ||
    profiles[0] ||
    null;

  return taskProfile;
}
