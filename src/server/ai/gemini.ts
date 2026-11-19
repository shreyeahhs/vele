import "server-only";
import { ApiError, GoogleGenAI, type Content, type FunctionCall, type GenerateContentResponse, type Part } from "@google/genai";
import { AppError, errors } from "@/lib/errors";
import { log } from "@/lib/logger";
import type { AIMessage, AIProvider, AIToolCall, AITurnResult, FinishReason, GenerateRequest } from "./types";

/**
 * Google Gemini via the official @google/genai SDK, one configured model, no
 * fallback. Manual function calling: the agent executes tools itself so every
 * call goes through validation and the scheduling engine. Model turns are
 * replayed verbatim so thought signatures survive multi-step tool use.
 *
 * Resilience is limited to the same model: network blips are retried, and
 * requests are spread over the configured API keys, one key per request. A
 * key that is rate limited (429), overloaded (500/503) or silent for
 * IDLE_TIMEOUT_MS is abandoned for the next one straight away, within an
 * overall TURN_BUDGET_MS. Anything else surfaces as a clear error.
 */
/** Longest silence from Gemini (before the first chunk or between chunks) before the key is abandoned. */
const IDLE_TIMEOUT_MS = 40_000;
/** Longest one model call may take across every key it tries. */
const TURN_BUDGET_MS = 100_000;

export class GeminiProvider implements AIProvider {
  readonly id = "gemini";
  private readonly clients: GoogleGenAI[];
  /** Round-robin cursor: each request starts on the next key in the ring. */
  private static cursor = 0;

  constructor(
    apiKeys: string[],
    readonly model: string,
  ) {
    this.clients = apiKeys.map((apiKey) => new GoogleGenAI({ apiKey }));
  }

  private clientAt(offset: number): GoogleGenAI {
    return this.clients[(GeminiProvider.cursor + offset) % this.clients.length];
  }

  async generate(req: GenerateRequest): Promise<AITurnResult> {
    const contents = toContents(req.messages);
    // This request's key, and how many of the others have been tried after it.
    GeminiProvider.cursor = (GeminiProvider.cursor + 1) % this.clients.length;
    const deadline = Date.now() + TURN_BUDGET_MS;
    let keysTried = 0;
    let networkRetries = 0;
    for (;;) {
      // Each attempt gets its own abort: the caller's signal (the person left)
      // or the watchdog (Gemini went quiet) stops it.
      const attempt = new AbortController();
      const onAbort = () => attempt.abort(req.signal?.reason);
      req.signal?.addEventListener("abort", onAbort, { once: true });
      let stalled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const watchdog = () => {
        clearTimeout(timer);
        timer = setTimeout(
          () => {
            stalled = true;
            attempt.abort(new Error("Gemini stopped responding"));
          },
          Math.max(1_000, Math.min(IDLE_TIMEOUT_MS, deadline - Date.now())),
        );
      };
      let emitted = false;
      try {
        watchdog();
        const config = {
          systemInstruction: req.system,
          tools: req.tools.length
            ? [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }]
            : undefined,
          temperature: 0.2,
          maxOutputTokens: 8192,
          abortSignal: attempt.signal,
        };
        const stream = await this.clientAt(keysTried).models.generateContentStream({ model: this.model, contents, config });
        return await this.consume(stream, {
          ...req,
          onChunk: watchdog,
          onText: req.onText
            ? (t) => {
                emitted = true;
                req.onText!(t);
              }
            : undefined,
        });
      } catch (err) {
        if (req.signal?.aborted) throw mapError(err);
        // Text already reached the person: a retry would repeat it.
        const canRetry = !emitted && Date.now() < deadline - 2_000;
        const moreKeys = keysTried + 1 < this.clients.length;
        if (canRetry && isNetworkError(err) && networkRetries < 2) {
          networkRetries++;
          await sleep(700 * networkRetries);
          continue;
        }
        // Overloaded, silent, rate-limited or rejected on this key: the same
        // model on the next key, straight away.
        const keyProblem = stalled || (err instanceof ApiError && [403, 429, 500, 503].includes(err.status));
        if (canRetry && keyProblem && moreKeys) {
          log.warn("ai.gemini_retry", { reason: stalled ? "stalled" : (err as ApiError).status, key: keysTried });
          keysTried++;
          continue;
        }
        if (stalled)
          throw new AppError("ai_unavailable", "Gemini didn't answer in time; it seems overloaded right now. Nothing was changed. Try again in a moment.", { cause: err });
        throw mapError(err);
      } finally {
        clearTimeout(timer);
        req.signal?.removeEventListener("abort", onAbort);
      }
    }
  }

  private async consume(stream: AsyncGenerator<GenerateContentResponse>, req: GenerateRequest & { onChunk?: () => void }): Promise<AITurnResult> {
    const parts: Part[] = [];
    let finishRaw: string | undefined;
    let usage = { input: 0, output: 0, thoughts: 0 };
    let blockedPrompt = false;
    for await (const chunk of stream) {
      req.onChunk?.();
      if (chunk.promptFeedback?.blockReason) blockedPrompt = true;
      const candidate = chunk.candidates?.[0];
      for (const part of candidate?.content?.parts ?? []) {
        parts.push(part);
        if (part.text && !part.thought && req.onText) req.onText(part.text);
      }
      if (candidate?.finishReason) finishRaw = candidate.finishReason;
      if (chunk.usageMetadata) {
        usage = {
          input: chunk.usageMetadata.promptTokenCount ?? usage.input,
          output: chunk.usageMetadata.candidatesTokenCount ?? usage.output,
          thoughts: chunk.usageMetadata.thoughtsTokenCount ?? usage.thoughts,
        };
      }
    }

    const toolCalls: AIToolCall[] = parts
      .filter((p): p is Part & { functionCall: FunctionCall } => Boolean(p.functionCall?.name))
      .map((p, i) => ({
        id: p.functionCall.id ?? `${p.functionCall.name}_${i}`,
        name: p.functionCall.name!,
        args: (p.functionCall.args ?? {}) as Record<string, unknown>,
        providerId: Boolean(p.functionCall.id),
      }));
    const text = parts
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join("");

    let finish: FinishReason = toolCalls.length ? "tool_calls" : "stop";
    if (blockedPrompt) finish = "blocked";
    else if (finishRaw === "MAX_TOKENS") finish = "max_tokens";
    else if (finishRaw === "MALFORMED_FUNCTION_CALL") finish = "malformed";
    else if (finishRaw && ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"].includes(finishRaw)) finish = "blocked";

    return { text, toolCalls, raw: { role: "model", parts } satisfies Content, finish, usage, model: this.model };
  }
}

function toContents(messages: AIMessage[]): Content[] {
  const out: Content[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", parts: [{ text: m.text }] });
    } else if (m.role === "assistant") {
      if (m.provider === "gemini" && m.raw && typeof m.raw === "object") {
        out.push(m.raw as Content);
      } else {
        const parts: Part[] = [];
        if (m.text) parts.push({ text: m.text });
        for (const c of m.toolCalls) parts.push({ functionCall: { name: c.name, args: c.args, ...(c.providerId ? { id: c.id } : {}) } });
        if (parts.length) out.push({ role: "model", parts });
      }
    } else {
      out.push({
        role: "user",
        parts: m.results.map((r) => ({
          functionResponse: {
            name: r.name,
            ...(r.providerId ? { id: r.callId } : {}),
            response: r.isError ? { error: r.result } : { output: r.result },
          },
        })),
      });
    }
  }
  return out;
}

function isNetworkError(err: unknown): boolean {
  const e = err as { name?: string; message?: string; cause?: { code?: string } };
  return e?.name === "TypeError" && /fetch failed|network|socket|ECONNRESET|ETIMEDOUT/i.test(`${e.message} ${e.cause?.code ?? ""}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function mapError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ApiError) {
    // Which quota ran out is the useful part of a 429 ("…PerDay…" vs "…PerMinute…").
    const quotaIds = [...new Set([...err.message.matchAll(/\\?"quotaId\\?":\s*\\?"([^"\\]+)/g)].map((m) => m[1]))];
    log.warn("ai.gemini_error", { status: err.status, quota: quotaIds.join(",") || undefined, detail: quotaIds.length ? undefined : err.message.slice(0, 300) });
    if (err.status === 401 || err.status === 403) return new AppError("ai_unavailable", "The Gemini API keys were rejected. Check GEMINI_API_KEYS.", { cause: err });
    if (err.status === 429) {
      const noQuota = /limit: 0\b/.test(err.message);
      const daily = quotaIds.some((q) => /PerDay/i.test(q));
      return new AppError(
        "rate_limited",
        noQuota
          ? "This Gemini model isn't available on the free tier of these keys. Enable billing in Google AI Studio, or choose another GEMINI_MODEL."
          : daily
            ? "Today's free Gemini quota is used up on every configured key. It resets at midnight Pacific time; enabling billing removes the cap."
            : "Every configured Gemini key is rate limited right now. Try again in a minute, or add more keys.",
        { cause: err },
      );
    }
    if (err.status === 503) return new AppError("ai_unavailable", "Gemini is overloaded right now. Try again in a moment.", { cause: err });
    if (err.status === 404) return new AppError("ai_unavailable", "The configured Gemini model isn't available. Check GEMINI_MODEL.", { cause: err });
  } else if ((err as Error)?.name === "AbortError") {
    return new AppError("ai_unavailable", "Stopped.", { cause: err });
  } else {
    log.warn("ai.gemini_error", { err });
  }
  return errors.aiUnavailable(err);
}
