"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Send, Unlink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/primitives";
import { qk } from "@/hooks/use-api";
import { apiGet, apiSend, errorMessage } from "@/lib/fetcher";
import { SettingsSection } from "./settings-nav";

interface Identities {
  configured: { TELEGRAM: boolean; WHATSAPP: boolean };
  identities: Array<{ id: string; provider: "TELEGRAM" | "WHATSAPP"; displayName: string | null; handle: string; createdAt: string }>;
}

interface LinkCode {
  code: string;
  expiresInMinutes: number;
  telegramUrl: string | null;
  instructions: string;
}

const NAMES = { TELEGRAM: "Telegram", WHATSAPP: "WhatsApp" } as const;

export function MessagingSettings() {
  const qc = useQueryClient();
  const data = useQuery({ queryKey: qk.messaging, queryFn: () => apiGet<Identities>("/api/messaging/identities") });
  const [codes, setCodes] = useState<Partial<Record<"TELEGRAM" | "WHATSAPP", LinkCode>>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const link = async (provider: "TELEGRAM" | "WHATSAPP") => {
    setBusy(provider);
    try {
      const res = await apiSend<LinkCode>("/api/messaging/link", "POST", { provider });
      setCodes((c) => ({ ...c, [provider]: res }));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  const unlink = async (id: string) => {
    try {
      await apiSend(`/api/messaging/identities?id=${encodeURIComponent(id)}`, "DELETE");
      await qc.invalidateQueries({ queryKey: qk.messaging });
      toast.success("Disconnected.");
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <SettingsSection
      title="Message Vele"
      description="Connect a chat app and talk to Vele from your phone: “what’s on tomorrow?”, “move my 3pm to 4”. The same confirmation rules apply: anything that invites people or changes several events waits for your yes."
    >
      {data.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : data.isError ? (
        <p role="alert" className="font-semibold text-red-ink-text">
          {errorMessage(data.error)}
        </p>
      ) : (
        <div className="border-b border-rule">
          {(["TELEGRAM", "WHATSAPP"] as const).map((provider) => {
            const linked = data.data.identities.filter((i) => i.provider === provider);
            const configured = data.data.configured[provider];
            const code = codes[provider];
            return (
              <div key={provider} className="border-t border-rule px-2 py-3.5">
                <div className="flex flex-wrap items-center gap-3">
                  <Send className="size-4 text-graphite" aria-hidden />
                  <p className="flex-1 text-body font-bold">{NAMES[provider]}</p>
                  {!configured ? <Badge tone="pencil">Not set up on this server</Badge> : linked.length > 0 ? <Badge tone="green">Connected</Badge> : null}
                  {configured && (
                    <Button size="sm" variant={linked.length ? "ghost" : "primary"} loading={busy === provider} onClick={() => link(provider)}>
                      {linked.length ? "Connect another chat" : "Connect"}
                    </Button>
                  )}
                </div>
                {!configured && (
                  <p className="mt-2 max-w-[55ch] text-small text-graphite">
                    {provider === "TELEGRAM"
                      ? "Needs a bot token from @BotFather and a webhook secret on the server. docs/SETUP.md walks through it."
                      : "Needs a WhatsApp Business (Cloud API) number and its access token, app secret and verify token. docs/SETUP.md walks through it."}
                  </p>
                )}
                {code && (
                  <div className="mt-3 grid gap-2 rounded-[2px] border-[1.5px] border-ink-2 bg-paper-2 p-3">
                    <p className="text-small text-ink-2">{code.instructions}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="dymo h-9 px-3 text-lead">{code.code}</code>
                      <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(code.code).then(() => toast.success("Code copied."))}>
                        <Copy /> Copy
                      </Button>
                      {code.telegramUrl && (
                        <Button size="sm" variant="secondary" asChild>
                          <a href={code.telegramUrl} target="_blank" rel="noopener noreferrer">
                            Open Telegram <ExternalLink />
                          </a>
                        </Button>
                      )}
                    </div>
                    <p className="text-micro text-graphite">Works once, for {code.expiresInMinutes} minutes.</p>
                  </div>
                )}
                {linked.length > 0 && (
                  <ul className="mt-3 grid gap-1 border-t border-rule pt-3">
                    {linked.map((i) => (
                      <li key={i.id} className="flex items-center gap-3 text-small">
                        <span className="min-w-0 flex-1 truncate">
                          {i.displayName ?? i.handle} <span className="text-graphite">· {i.handle}</span>
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => unlink(i.id)}>
                          <Unlink /> Disconnect
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SettingsSection>
  );
}
