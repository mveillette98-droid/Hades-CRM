"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { labelReply } from "@/lib/outbound/actions";
import { REPLY_LABELS } from "@/lib/outbound/labels";
import type { InboundMessage } from "@/lib/outbound/queries";
import { cn } from "@/lib/utils";

export function ReplyCard({ msg, showCampaign }: { msg: InboundMessage; showCampaign?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const lead = msg.campaign_leads;
  const name = [lead?.first_name, lead?.last_name].filter(Boolean).join(" ") || msg.from_email;
  const body = msg.body_text ?? "";
  const long = body.length > 400;

  return (
    <div className={cn("rounded-md border bg-ink-900 p-4", msg.handled ? "border-ink-700" : "border-gold-700/60")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-foreground">
            {name}
            {lead?.company && <span className="text-muted-foreground"> · {lead.company}</span>}
          </p>
          <p className="text-xs text-muted-foreground">
            {msg.from_email} · {formatDistanceToNow(new Date(msg.sent_at), { addSuffix: true })}
            {showCampaign && msg.campaigns && msg.campaign_id && (
              <>
                {" · "}
                <Link href={`/outbound/${msg.campaign_id}`} className="hover:text-crimson-400">
                  {msg.campaigns.name}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {msg.kind === "unsubscribe" && <Badge variant="outline">Unsubscribed</Badge>}
          {!msg.handled && <Badge variant="gold">New</Badge>}
        </div>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
        {expanded || !long ? body : `${body.slice(0, 400)}…`}
      </p>
      {long && (
        <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-1 text-xs text-muted-foreground hover:text-foreground">
          {expanded ? "Show less" : "Show all"}
        </button>
      )}
      {msg.kind === "reply" && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {REPLY_LABELS.map((l) => (
            <Button
              key={l.value}
              size="sm"
              variant={lead?.reply_label === l.value ? "gold" : "outline"}
              className="h-7 px-2 text-xs"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await labelReply(msg.id, lead?.reply_label === l.value ? null : l.value);
                  router.refresh();
                })
              }
            >
              {l.label}
            </Button>
          ))}
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">Answer from {msg.to_email} in your inbox. The sequence has stopped for this lead.</p>
    </div>
  );
}
