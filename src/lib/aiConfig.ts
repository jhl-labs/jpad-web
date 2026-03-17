export const AI_PROVIDER_VALUES = [
  "anthropic",
  "openai",
  "gemini",
  "openai-compatible",
  "ollama",
] as const;

export const AI_TASK_VALUES = [
  "general",
  "write",
  "chat",
  "summary",
  "autocomplete",
  "embedding",
] as const;

export type AiProviderType = (typeof AI_PROVIDER_VALUES)[number];
export type AiTaskType = (typeof AI_TASK_VALUES)[number];

export const AI_SECRET_MASK = "••••••••";

export interface WorkspaceAiProfile {
  id: string;
  name: string;
  provider: AiProviderType;
  enabled: boolean;
  model: string;
  apiKey: string | null;
  baseUrl: string | null;
  temperature: number | null;
  topP: number | null;
  topK: number | null;
  maxTokens: number | null;
  presencePenalty: number | null;
  frequencyPenalty: number | null;
  repeatPenalty: number | null;
  seed: number | null;
  stop: string[];
  customHeaders: Record<string, string> | null;
}

export type WorkspaceAiTaskRouting = Record<AiTaskType, string | null>;

export const DEFAULT_AI_TASK_ROUTING: WorkspaceAiTaskRouting = {
  general: null,
  write: null,
  chat: null,
  summary: null,
  autocomplete: null,
  embedding: null,
};

export function buildDefaultAiProfile(
  overrides: Partial<WorkspaceAiProfile> = {}
): WorkspaceAiProfile {
  return {
    id: overrides.id || "legacy-anthropic",
    name: overrides.name || "Default Anthropic",
    provider: overrides.provider || "anthropic",
    enabled: overrides.enabled ?? true,
    model: overrides.model || "claude-sonnet-4-20250514",
    apiKey: overrides.apiKey ?? null,
    baseUrl: overrides.baseUrl ?? null,
    temperature: overrides.temperature ?? null,
    topP: overrides.topP ?? null,
    topK: overrides.topK ?? null,
    maxTokens: overrides.maxTokens ?? 2048,
    presencePenalty: overrides.presencePenalty ?? null,
    frequencyPenalty: overrides.frequencyPenalty ?? null,
    repeatPenalty: overrides.repeatPenalty ?? null,
    seed: overrides.seed ?? null,
    stop: overrides.stop ?? [],
    customHeaders: overrides.customHeaders ?? null,
  };
}

export function getAiProviderLabel(provider: AiProviderType) {
  switch (provider) {
    case "anthropic":
      return "Anthropic";
    case "openai":
      return "OpenAI";
    case "gemini":
      return "Google Gemini";
    case "openai-compatible":
      return "OpenAI Compatible";
    case "ollama":
      return "Ollama";
    default:
      return provider;
  }
}

export function getAiTaskLabel(task: AiTaskType) {
  switch (task) {
    case "general":
      return "일반 기본 모델";
    case "write":
      return "문서 작성/변환";
    case "chat":
      return "AI 채팅";
    case "summary":
      return "요약";
    case "autocomplete":
      return "자동 완성";
    case "embedding":
      return "임베딩";
    default:
      return task;
  }
}
