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

function stripThinkingProcess(text: string): string {
  if (!text) return "";
  // <think>...</think> 태그 제거
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // "Final Version:", "Final Output:", "Output:" 등의 마커 뒤의 실제 답변 추출
  const finalMarkers = [
    /\*\s*Final Version:\s*\n/i,
    /\*\s*Final Output:\s*\n/i,
    /\*\s*Output:\s*\n/i,
    /Final Answer:\s*\n/i,
    /\n---\s*\n/,
  ];
  for (const marker of finalMarkers) {
    const match = cleaned.search(marker);
    if (match >= 0) {
      const markerMatch = cleaned.slice(match).match(marker);
      if (markerMatch) {
        const afterMarker = cleaned.slice(match + markerMatch[0].length).trim();
        if (afterMarker.length > 20) return afterMarker;
      }
    }
  }

  // "Thinking Process:" 로 시작하면 — 한국어/CJK 텍스트 블록을 찾아 추출
  if (/^Thinking Process:/i.test(cleaned)) {
    // 연속된 한국어/CJK 문장이 포함된 마지막 블록 추출
    const cjkBlocks = cleaned.match(/[\uAC00-\uD7AF\u3040-\u30FF\u4E00-\u9FFF].{50,}/g);
    if (cjkBlocks && cjkBlocks.length > 0) {
      // 가장 긴 CJK 블록을 사용
      const longest = cjkBlocks.reduce((a, b) => a.length >= b.length ? a : b);
      // 해당 블록의 시작 위치부터 끝까지 추출
      const blockStart = cleaned.lastIndexOf(longest);
      if (blockStart > 0) {
        return cleaned.slice(blockStart).trim();
      }
    }
    return "";
  }

  return cleaned;
}

function mergeHeaders(
  base: Record<string, string>,
  custom: Record<string, string> | null | undefined
): Record<string, string> {
  if (!custom || Object.keys(custom).length === 0) return base;
  return { ...base, ...custom };
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
        headers: mergeHeaders({
          "content-type": "application/json",
          "x-api-key": runtime.apiKey,
          "anthropic-version": "2023-06-01",
        }, runtime.customHeaders),
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
        headers: mergeHeaders({
          "content-type": "application/json",
          authorization: `Bearer ${runtime.apiKey}`,
        }, runtime.customHeaders),
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
          headers: mergeHeaders({ "content-type": "application/json" }, runtime.customHeaders),
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
      const ollamaListHeaders: Record<string, string> = { "content-type": "application/json" };
      if (runtime.apiKey) {
        ollamaListHeaders.authorization = `Bearer ${runtime.apiKey}`;
      }

      const response = await fetchWithTimeout(buildApiUrl(runtime.baseUrl, "/api/tags"), {
        headers: mergeHeaders(ollamaListHeaders, runtime.customHeaders),
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
        headers: mergeHeaders({
          "content-type": "application/json",
          "x-api-key": runtime.apiKey,
          "anthropic-version": "2023-06-01",
        }, runtime.customHeaders),
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
          headers: mergeHeaders({
            "content-type": "application/json",
            authorization: `Bearer ${runtime.apiKey}`,
          }, runtime.customHeaders),
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
          message?: { content?: unknown; reasoning?: string; reasoning_content?: string };
        }>;
      };
      const msg = data.choices?.[0]?.message;
      const text = normalizeOpenAiMessageContent(msg?.content);
      if (text) return text;
      // thinking 모델: content가 비어있으면 reasoning에서 실제 답변 추출 시도
      const reasoning = msg?.reasoning || msg?.reasoning_content || "";
      return stripThinkingProcess(reasoning);
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
          headers: mergeHeaders({ "content-type": "application/json" }, runtime.customHeaders),
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
      const ollamaChatHeaders: Record<string, string> = { "content-type": "application/json" };
      if (runtime.apiKey) {
        ollamaChatHeaders.authorization = `Bearer ${runtime.apiKey}`;
      }

      const response = await fetchWithTimeout(buildApiUrl(runtime.baseUrl, "/api/chat"), {
        method: "POST",
        headers: mergeHeaders(ollamaChatHeaders, runtime.customHeaders),
        body: JSON.stringify({
          model: runtime.model,
          stream: false,
          think: false,
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
          headers: mergeHeaders({
            "content-type": "application/json",
            authorization: `Bearer ${runtime.apiKey}`,
          }, runtime.customHeaders),
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
          headers: mergeHeaders({ "content-type": "application/json" }, runtime.customHeaders),
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
      const ollamaEmbedHeaders: Record<string, string> = { "content-type": "application/json" };
      if (runtime.apiKey) {
        ollamaEmbedHeaders.authorization = `Bearer ${runtime.apiKey}`;
      }

      const response = await fetchWithTimeout(buildApiUrl(runtime.baseUrl, "/api/embeddings"), {
        method: "POST",
        headers: mergeHeaders(ollamaEmbedHeaders, runtime.customHeaders),
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
