/**
 * Parse a Server-Sent Events stream from a fetch Response,
 * yielding each `data.text` value as it arrives.
 *
 * Throws if the stream contains a `data.error` field.
 */
export async function* parseSSEStream(response: Response): AsyncGenerator<string> {
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  if (!reader) return;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data: ")) {
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.text) yield parsed.text;
            if (parsed.error) throw new Error(parsed.error);
          } catch (e) {
            // Re-throw SSE error messages, ignore JSON parse failures (incomplete chunks)
            if (e instanceof Error && e.message !== "Unexpected end of JSON input") {
              // Only re-throw if it was an explicit error from parsed.error
              if (line.includes('"error"')) throw e;
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
