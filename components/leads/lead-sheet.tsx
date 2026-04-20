"use client";

import { useState } from "react";
import { Plus, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LeadForm } from "./lead-form";
import type { Lead, PipelineStage, Profile } from "@/lib/supabase/types";

interface LeadSheetProps {
  mode: "create" | "edit";
  lead?: Lead;
  stages: PipelineStage[];
  team: Pick<Profile, "id" | "full_name" | "email">[];
  triggerVariant?: "default" | "outline" | "ghost" | "secondary";
  triggerLabel?: string;
}

export function LeadSheet({
  mode,
  lead,
  stages,
  team,
  triggerVariant = "default",
  triggerLabel,
}: LeadSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} size={mode === "create" ? "default" : "sm"}>
          {mode === "create" ? (
            <>
              <Plus className="h-4 w-4" />
              {triggerLabel ?? "Add lead"}
            </>
          ) : (
            <>
              <Pencil className="h-3.5 w-3.5" />
              {triggerLabel ?? "Edit"}
            </>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent
        side="right"
        className="flex h-full max-w-xl flex-col gap-0 p-0"
      >
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New lead" : `Editing ${lead?.company_name}`}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Log the deal. Assign it to yourself. Close it."
              : "Every change is stamped into the activity log."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <LeadForm
            mode={mode}
            lead={lead}
            stages={stages}
            team={team}
            onDone={() => setOpen(false)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
