"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteClientProfile } from "@/lib/clients/actions";

export function DeleteClientButton({ clientId, name }: { clientId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="destructive"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete ${name} and every agent run for it? This can't be undone.`)) return;
        start(async () => {
          const res = await deleteClientProfile(clientId);
          if (res.ok) router.push("/clients");
          else alert(res.error);
        });
      }}
    >
      <Trash2 className="h-3.5 w-3.5" />
      Delete
    </Button>
  );
}
