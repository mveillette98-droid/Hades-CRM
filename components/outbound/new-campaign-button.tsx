"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createBlankCampaign } from "@/lib/outbound/actions";
import { nativeSelect } from "./bits";

export function NewCampaignButton({ clients }: { clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  if (clients.length === 0) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <select className={`${nativeSelect} h-9 w-48`} value={clientId} onChange={(e) => setClientId(e.target.value)}>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !clientId}
          onClick={() =>
            start(async () => {
              const res = await createBlankCampaign(clientId);
              if (!res.ok) return setError(res.error);
              router.push(`/outbound/${res.data!.id}`);
            })
          }
        >
          <Plus className="h-3.5 w-3.5" />
          Blank campaign
        </Button>
      </div>
      {error && <p className="text-xs text-crimson-300">{error}</p>}
    </div>
  );
}
