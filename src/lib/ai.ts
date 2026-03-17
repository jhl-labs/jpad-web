import { AiTaskType } from "@/lib/aiConfig";
import { checkWorkspaceAccess } from "@/lib/auth/helpers";
import { completeWithProfile, streamWithProfile, resolveAiProfileRuntime } from "@/lib/llmProviders";
import { getPageAccessContext } from "@/lib/pageAccess";
import { resolveAiProfileForTask } from "@/lib/aiSettings";
import { getEffectiveWorkspaceSettings } from "@/lib/workspaceSettings";

export class AiError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function normalizeMaxTokens(requested: number | undefined, configured: number | null | undefined) {
  const fallback = Math.max(1, configured || requested || 2048);
  if (typeof requested !== "number" || Number.isNaN(requested)) {
    return fallback;
  }

  return Math.min(Math.max(1, Math.floor(requested)), fallback);
}

export async function resolveAiWorkspaceContext(
  userId: string,
  input: { workspaceId?: string; pageId?: string }
) {
  if (input.pageId) {
    const access = await getPageAccessContext(userId, input.pageId);
    if (!access) {
      throw new AiError("Page not found", 404);
    }
    if (!access.canView) {
      throw new AiError("Forbidden", 403);
    }
    if (input.workspaceId && access.page.workspaceId !== input.workspaceId) {
      throw new AiError("Page not found", 404);
    }
    if (access.member?.isPublicViewer) {
      throw new AiError("AI is not available for public viewers", 403);
    }

    return {
      workspaceId: access.page.workspaceId,
      page: access.page,
    };
  }

  if (!input.workspaceId) {
    throw new AiError("workspaceId or pageId is required", 400);
  }

  const member = await checkWorkspaceAccess(userId, input.workspaceId);
  if (!member) {
    throw new AiError("Forbidden", 403);
  }
  if (member.isPublicViewer) {
    throw new AiError("AI is not available for public viewers", 403);
  }

  return {
    workspaceId: input.workspaceId,
    page: null,
  };
}

async function getWorkspaceAiRuntime(
  workspaceId: string,
  task: AiTaskType,
  requestedMaxTokens?: number
) {
  const settings = await getEffectiveWorkspaceSettings(workspaceId);
  if (!settings.aiEnabled) {
    throw new AiError("AI is disabled for this workspace", 403);
  }

  const profile = resolveAiProfileForTask(
    settings.aiProfiles,
    settings.aiTaskRouting,
    task
  );
  if (!profile) {
    throw new AiError("No active AI profile is configured for this task", 503);
  }
  if (!profile.model.trim()) {
    throw new AiError("Selected AI profile has no model configured", 503);
  }

  return {
    profile,
    maxTokens: normalizeMaxTokens(
      requestedMaxTokens,
      profile.maxTokens || settings.aiMaxTokens
    ),
  };
}

export async function aiComplete(
  workspaceId: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens = 2048,
  task: AiTaskType = "general"
): Promise<string> {
  const runtime = await getWorkspaceAiRuntime(workspaceId, task, maxTokens);
  return completeWithProfile(runtime.profile, {
    systemPrompt,
    userMessage,
    maxTokens: runtime.maxTokens,
  });
}

export async function* aiStreamText(
  workspaceId: string,
  systemPrompt: string,
  userMessage: string,
  maxTokens = 2048,
  task: AiTaskType = "general"
) {
  const runtime = await getWorkspaceAiRuntime(workspaceId, task, maxTokens);

  const resolved = resolveAiProfileRuntime(runtime.profile);

  for await (const chunk of streamWithProfile(resolved, {
    systemPrompt,
    userMessage,
    maxTokens: runtime.maxTokens,
  })) {
    yield chunk;
  }
}

export const AI_PROMPTS = {
  summarize: (lang: string) =>
    `You are a document summarizer. Summarize the following content in ${lang}. Be concise (3-5 bullet points). Output only the summary, no preamble.`,

  expand: (lang: string) =>
    `You are a writing assistant. Expand the following text with more detail and examples in ${lang}. Keep the same tone and style. Output only the expanded text.`,

  translate: (targetLang: string) =>
    `You are a translator. Translate the following text to ${targetLang}. Output only the translation, nothing else.`,

  fixGrammar: (lang: string) =>
    `You are a ${lang} grammar expert. Fix any grammar, spelling, or punctuation errors. Keep the original meaning and style. Output only the corrected text.`,

  changeTone: (tone: string, lang: string) =>
    `You are a writing assistant. Rewrite the following text in a ${tone} tone in ${lang}. Output only the rewritten text.`,

  explain: (lang: string) =>
    `You are a helpful assistant. Explain the following content in simple terms in ${lang}. Output only the explanation.`,

  actionItems: (lang: string) =>
    `You are a productivity assistant. Extract action items and tasks from the following content. Format as a numbered list in ${lang}. Output only the list.`,

  qaSystem: (context: string, lang: string) =>
    `You are a knowledgeable assistant for a workspace. Answer questions based on the following workspace documents. Always respond in ${lang}. If you can't find the answer in the documents, say so clearly.\n\n--- Workspace Documents ---\n${context}\n--- End of Documents ---`,
};
