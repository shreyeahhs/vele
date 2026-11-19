/**
 * Provider-neutral contract between the agent and a language model. The agent
 * (tools, confirmations, persistence) never imports a vendor SDK; a provider
 * translates these shapes to and from its own API.
 */

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema (object) describing the arguments. */
  parameters: Record<string, unknown>;
}

export interface AIToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** Whether the provider issued the id (and expects it echoed back). */
  providerId: boolean;
}

export interface AIToolResult {
  callId: string;
  name: string;
  result: unknown;
  isError?: boolean;
  providerId: boolean;
}

export type AIMessage =
  | { role: "user"; text: string }
  /** `raw` is the provider's native message, replayed verbatim (e.g. Gemini thought signatures). */
  | { role: "assistant"; text: string; toolCalls: AIToolCall[]; raw?: unknown; provider?: string }
  | { role: "tool"; results: AIToolResult[] };

export type FinishReason = "stop" | "tool_calls" | "max_tokens" | "blocked" | "malformed" | "other";

export interface AITurnResult {
  text: string;
  toolCalls: AIToolCall[];
  raw: unknown;
  finish: FinishReason;
  usage: { input: number; output: number; thoughts: number };
  /** The model that actually answered (may be a fallback). */
  model?: string;
}

export interface GenerateRequest {
  system: string;
  messages: AIMessage[];
  tools: ToolSpec[];
  signal?: AbortSignal;
  /** Streams user-visible text as it is generated. */
  onText?: (delta: string) => void;
  /** Progress notes worth showing the user (e.g. waiting on a rate limit). */
  onStatus?: (message: string) => void;
}

export interface AIProvider {
  readonly id: string;
  readonly model: string;
  generate(req: GenerateRequest): Promise<AITurnResult>;
}
