import { WorkspaceAiProfile } from "@/lib/aiConfig";
import { getResolvedApiKeyForProfile, getResolvedBaseUrl } from "@/lib/aiSettings";

export interface ResolvedAiProfile extends Omit<WorkspaceAiProfile, "apiKey" | "baseUrl"> {
  apiKey: string | null;
  baseUrl: string;
}

interface CompletionOptions {
  systemPrompt: string;
  userMessage: string;
  maxTokens?: number;
}

type EmbeddingPurpose = "query" | "document";

function trimTrailingSlashes(value: string) {
  return value.replace(/\/+$/, "");
}

function buildApiUrl(baseUrl: string, path: string) {
  const cleanBase = trimTrailingSlashes(baseUrl);
  const cleanPath = path.startsWith("/") ? path : `/${path}`;

  if (cleanBase.endsWith("/v1") && cleanPath.startsWith("/v1/")) {
    return `${cleanBase}${cleanPath.slice(3)}`;
  }
  if (cleanBase.endsWith("/api") && cleanPath.startsWith("/api/")) {
    return `${cleanBase}${cleanPath.slice(4)}`;
  }
  if (cleanBase.endsWith("/v1beta") && cleanPath.startsWith("/v1beta/")) {
    return `${cleanBase}${cleanPath.slice(7)}`;
  }

  return `${cleanBase}${cleanPath}`;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs = 15000
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseErrorResponse(response: Response) {
  const text = await response.text();

  try {
    const data = JSON.parse(text) as
      | { error?: { message?: string } | string; message?: string }
      | undefined;
    if (typeof data?.error === "string") return data.error;
    if (typeof data?.error === "object" && data.error?.message) {
      return data.error.message;
    }
    if (data?.message) return data.message;
  } catch (_error) {
    // ignore JSON parse failures
  }

  return text || `${response.status} ${response.statusText}`;
}

function resolveMaxTokens(profile: ResolvedAiProfile, requestedMaxTokens?: number) {
  const configured = profile.maxTokens || requestedMaxTokens || 2048;
  if (typeof requestedMaxTokens !== "number" || Number.isNaN(requestedMaxTokens)) {
    return configured;
  }
  return Math.max(1, Math.min(configured, Math.floor(requestedMaxTokens)));
}

function normalizeOpenAiMessageContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const text = (item as { text?: unknown }).text;
      return typeof text === "string" ? text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function normalizeGeminiModelName(name: string) {
  return name.replace(/^models\//, "");
}

function normalizeEmbedding(values: unknown): number[] {
  if (!Array.isArray(values)) {
    throw new Error("Embedding response is not an array");
  }

  const vector = values
    .map((value) => (typeof value === "number" ? value : Number(value)))
    .filter((value) => Number.isFinite(value));

  if (vector.length === 0) {
    throw new Error("Embedding vector is empty");
  }

  return vector;
}

export function resolveAiProfileRuntime(profile: WorkspaceAiProfile): ResolvedAiProfile {
  return {
    ...profile,
    apiKey: getResolvedApiKeyForProfile(profile),
    baseUrl: getResolvedBaseUrl(profile),
  };
}

export async function listModelsForProfile(profile: WorkspaceAiProfile) {
  const runtime = resolveAiProfileRuntime(profile);

  switch (runtime.provider) {
    case "anthropic": {
      if (!runtime.apiKey) {
        throw new Error("Anthropic API key is required");
      }

      const response = await fetchWithTimeout(buildApiUrl(runtime.baseUrl, "/v1/models"), {
        headers: {
          "content-type": "application/json",
          "x-api-key": runtime.apiKey,
          "anthropic-version": "2023-06-01",
        },
      });
      if (!response.ok) {
        throw new Error(await parseErrorResponse(response));
      }

      const data = (await response.json()) as {
        data?: Array<{ id?: string }>;
      };
      return (data.data || [])
        .map((item) => item.id || "")
        .filter(Boolean);
    }
    case "openai":
    case "openai-compatible": {
      if (!runtime.apiKey) {
        throw new Error("API key is required");
      }

      const response = await fetchWithTimeout(buildApiUrl(runtime.baseUrl, "/v1/models"), {
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${runtime.apiKey}`,
        },
      });
      if (!response.ok) {
        throw new Error(await parseErrorResponse(response));
      }

      const data = (await response.json()) as {
        data?: Array<{ id?: string }>;
      };
      return (data.data || [])
        .map((item) => item.id || "")
        .filter(Boolean);
    }
    case "gemini": {
      if (!runtime.apiKey) {
        throw new Error("Gemini API key is required");
      }

      const response = await fetchWithTimeout(
        `${buildApiUrl(runtime.baseUrl, "/v1beta/models")}?key=${encodeURIComponent(runtime.apiKey)}`,
        {
          headers: { "content-type": "application/json" },
        }
      );
      if (!response.ok) {
        throw new Error(await parseErrorResponse(response));
      }

      const data = (await response.json()) as {
        models?: Array<{
          name?: string;
          supportedGenerationMethods?: string[];
        }>;
      };
      return (data.models || [])
        .filter((item) =>
          Array.isArray(item.supportedGenerationMethods)
            ? item.supportedGenerationMethods.includes("generateContent")
            : true
        )
        .map((item) => normalizeGeminiModelName(item.name || ""))
        .filter(Boolean);
    }
    case "ollama": {
      const headers: HeadersInit = { "content-type": "application/json" };
      if (runtime.apiKey) {
        headers.authorization = `Bearer ${runtime.apiKey}`;
      }

      const response = await fetchWithTimeout(buildApiUrl(runtime.baseUrl, "/api/tags"), {
        headers,
      });
      if (!response.ok) {
        throw new Error(await parseErrorResponse(response));
      }

      const data = (await response.json()) as {
        models?: Array<{ name?: string; model?: string }>;
      };
      return (data.models || [])
        .map((item) => item.name || item.model || "")
        .filter(Boolean);
    }
    default:
      return [];
  }
}

export async function testConnectionForProfile(profile: WorkspaceAiProfile) {
  const models = await listModelsForProfile(profile);

  return {
    success: true,
    message:
      models.length > 0
        ? `${models.length}개 모델을 확인했습니다.`
        : "연결은 성공했지만 모델 목록은 비어 있습니다.",
    models,
  };
}

export async function completeWithProfile(
  profile: WorkspaceAiProfile,
  options: CompletionOptions
) {
  const runtime = resolveAiProfileRuntime(profile);
  const maxTokens = resolveMaxTokens(runtime, options.maxTokens);

  switch (runtime.provider) {
    case "anthropic": {
      if (!runtime.apiKey) {
        throw new Error("Anthropic API key is required");
      }

      const response = await fetchWithTimeout(buildApiUrl(runtime.baseUrl, "/v1/messages"), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": runtime.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: runtime.model,
          system: options.systemPrompt,
          max_tokens: maxTokens,
          temperature: runtime.temperature ?? undefined,
          top_p: runtime.topP ?? undefined,
          top_k: runtime.topK ?? undefined,
          stop_sequences: runtime.stop.length > 0 ? runtime.stop : undefined,
          messages: [{ role: "user", content: options.userMessage }],
        }),
      });
      if (!response.ok) {
        throw new Error(await parseErrorResponse(response));
      }

      const data = (await response.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      return (data.content || [])
        .filter((item) => item.type === "text" && typeof item.text === "string")
        .map((item) => item.text as string)
        .join("");
    }
    case "openai":
    case "openai-compatible": {
      if (!runtime.apiKey) {
        throw new Error("API key is required");
      }

      const response = await fetchWithTimeout(
        buildApiUrl(runtime.baseUrl, "/v1/chat/completions"),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${runtime.apiKey}`,
          },
          body: JSON.stringify({
            model: runtime.model,
            temperature: runtime.temperature ?? undefined,
            top_p: runtime.topP ?? undefined,
            max_tokens: maxTokens,
            frequency_penalty: runtime.frequencyPenalty ?? undefined,
            presence_penalty: runtime.presencePenalty ?? undefined,
            seed: runtime.seed ?? undefined,
            stop: runtime.stop.length > 0 ? runtime.stop : undefined,
            messages: [
              { role: "system", content: options.systemPrompt },
              { role: "user", content: options.userMessage },
            ],
          }),
        }
      );
      if (!response.ok) {
        throw new Error(await parseErrorResponse(response));
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message?: { content?: unknown };
        }>;
      };
      return normalizeOpenAiMessageContent(data.choices?.[0]?.message?.content);
    }
    case "gemini": {
      if (!runtime.apiKey) {
        throw new Error("Gemini API key is required");
      }

      const response = await fetchWithTimeout(
        `${buildApiUrl(
          runtime.baseUrl,
          `/v1beta/models/${encodeURIComponent(
            normalizeGeminiModelName(runtime.model)
          )}:generateContent`
        )}?key=${encodeURIComponent(runtime.apiKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: options.systemPrompt }],
            },
            contents: [
              {
                role: "user",
                parts: [{ text: options.userMessage }],
              },
            ],
            generationConfig: {
              temperature: runtime.temperature ?? undefined,
              topP: runtime.topP ?? undefined,
              topK: runtime.topK ?? undefined,
              maxOutputTokens: maxTokens,
              stopSequences: runtime.stop.length > 0 ? runtime.stop : undefined,
              seed: runtime.seed ?? undefined,
            },
          }),
        }
      );
      if (!response.ok) {
        throw new Error(await parseErrorResponse(response));
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      return (data.candidates?.[0]?.content?.parts || [])
        .map((part) => part.text || "")
        .join("");
    }
    case "ollama": {
      const headers: HeadersInit = { "content-type": "application/json" };
      if (runtime.apiKey) {
        headers.authorization = `Bearer ${runtime.apiKey}`;
      }

      const response = await fetchWithTimeout(buildApiUrl(runtime.baseUrl, "/api/chat"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: runtime.model,
          stream: false,
          messages: [
            { role: "system", content: options.systemPrompt },
            { role: "user", content: options.userMessage },
          ],
          options: {
            temperature: runtime.temperature ?? undefined,
            top_p: runtime.topP ?? undefined,
            top_k: runtime.topK ?? undefined,
            num_predict: maxTokens,
            repeat_penalty: runtime.repeatPenalty ?? undefined,
            stop: runtime.stop.length > 0 ? runtime.stop : undefined,
            seed: runtime.seed ?? undefined,
          },
        }),
      });
      if (!response.ok) {
        throw new Error(await parseErrorResponse(response));
      }

      const data = (await response.json()) as {
        message?: { content?: string };
      };
      return data.message?.content || "";
    }
    default:
      throw new Error("Unsupported AI provider");
  }
}

export function supportsEmbeddings(profile: WorkspaceAiProfile) {
  return profile.provider !== "anthropic";
}

export async function embedTextWithProfile(
  profile: WorkspaceAiProfile,
  input: string,
  purpose: EmbeddingPurpose = "document"
) {
  const runtime = resolveAiProfileRuntime(profile);
  const text = input.trim();
  if (!text) {
    throw new Error("Embedding input is empty");
  }

  switch (runtime.provider) {
    case "anthropic":
      throw new Error("Anthropic does not support embeddings in this integration");
    case "openai":
    case "openai-compatible": {
      if (!runtime.apiKey) {
        throw new Error("API key is required");
      }

      const response = await fetchWithTimeout(
        buildApiUrl(runtime.baseUrl, "/v1/embeddings"),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${runtime.apiKey}`,
          },
          body: JSON.stringify({
            model: runtime.model,
            input: text,
            encoding_format: "float",
          }),
        }
      );
      if (!response.ok) {
        throw new Error(await parseErrorResponse(response));
      }

      const data = (await response.json()) as {
        data?: Array<{ embedding?: unknown }>;
      };
      return normalizeEmbedding(data.data?.[0]?.embedding);
    }
    case "gemini": {
      if (!runtime.apiKey) {
        throw new Error("Gemini API key is required");
      }

      const response = await fetchWithTimeout(
        `${buildApiUrl(
          runtime.baseUrl,
          `/v1beta/models/${encodeURIComponent(
            normalizeGeminiModelName(runtime.model)
          )}:embedContent`
        )}?key=${encodeURIComponent(runtime.apiKey)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: `models/${normalizeGeminiModelName(runtime.model)}`,
            content: {
              parts: [{ text }],
            },
            taskType: purpose === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT",
          }),
        }
      );
      if (!response.ok) {
        throw new Error(await parseErrorResponse(response));
      }

      const data = (await response.json()) as {
        embedding?: { values?: unknown };
      };
      return normalizeEmbedding(data.embedding?.values);
    }
    case "ollama": {
      const headers: HeadersInit = { "content-type": "application/json" };
      if (runtime.apiKey) {
        headers.authorization = `Bearer ${runtime.apiKey}`;
      }

      const response = await fetchWithTimeout(buildApiUrl(runtime.baseUrl, "/api/embeddings"), {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: runtime.model,
          prompt: text,
        }),
      });
      if (!response.ok) {
        throw new Error(await parseErrorResponse(response));
      }

      const data = (await response.json()) as {
        embedding?: unknown;
      };
      return normalizeEmbedding(data.embedding);
    }
    default:
      throw new Error("Unsupported AI provider");
  }
}

export async function runTestGenerationForProfile(
  profile: WorkspaceAiProfile,
  prompt = "Reply with exactly OK."
) {
  const output = await completeWithProfile(profile, {
    systemPrompt:
      "You are a connectivity test assistant. Reply with a very short answer.",
    userMessage: prompt,
    maxTokens: 64,
  });

  return {
    success: true,
    output,
  };
}
