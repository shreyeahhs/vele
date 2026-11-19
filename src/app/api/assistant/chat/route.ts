import { z } from "zod";
import { route } from "@/lib/api";
import { limits } from "@/lib/rate-limit";
import { runAgent, type AgentEvent } from "@/server/ai/agent";

const body = z.object({
  message: z.string().trim().min(1, "Type a message first.").max(2000),
  conversationId: z.string().max(40).nullable().optional(),
});

/**
 * Streams one assistant turn as server-sent events:
 * start → (status | text | tool | ui)* → done | error.
 */
export const POST = route({ body, rateLimit: { rule: limits.agentChat, key: "user" } }, async ({ req, user, body: b }) => {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (e: AgentEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true;
        }
      };
      runAgent({ userId: user.id, text: b.message, channel: "WEB", conversationId: b.conversationId ?? null, onEvent: send, signal: req.signal })
        .catch((err: unknown) =>
          send({
            type: "error",
            message: err instanceof Error && "userMessage" in err ? String((err as { userMessage: string }).userMessage) : "Something went wrong. Please try again.",
          }),
        )
        .finally(() => {
          if (!closed) {
            closed = true;
            controller.close();
          }
        });
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
