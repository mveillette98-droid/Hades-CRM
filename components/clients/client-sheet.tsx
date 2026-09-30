"use client";

import { useState } from "react";
import { Pencil, Plus, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ClientForm, type ClientPrefill } from "./client-form";
import type { Client } from "@/lib/supabase/types";

interface ClientSheetProps {
  mode: "create" | "edit" | "convert";
  client?: Client;
  prefill?: ClientPrefill;
  triggerVariant?: "default" | "outline" | "ghost" | "secondary" | "gold";
}

export function ClientSheet({ mode, client, prefill, triggerVariant }: ClientSheetProps) {
  const [open, setOpen] = useState(false);

  const trigger =
    mode === "edit" ? (
      <>
        <Pencil className="h-3.5 w-3.5" />
        Edit brief
      </>
    ) : mode === "convert" ? (
      <>
        <UserPlus className="h-3.5 w-3.5" />
        Convert to client
      </>
    ) : (
      <>
        <Plus className="h-4 w-4" />
        New client
      </>
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={triggerVariant ?? (mode === "create" ? "default" : "outline")}
          size={mode === "create" ? "default" : "sm"}
        >
          {trigger}
        </Button>
      </DialogTrigger>
      <DialogContent side="right" className="flex h-full max-w-xl flex-col gap-0 p-0">
        <DialogHeader>
          <DialogTitle>
            {mode === "edit" ? `${client?.name} brief` : "New client"}
          </DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Changes apply to the next agent run."
              : "Fill the brief once. The agents do the rest."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <ClientForm
            mode={mode === "edit" ? "edit" : "create"}
            client={client}
            prefill={prefill}
            onDone={() => setOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
