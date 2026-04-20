"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { addLeadNote } from "@/lib/leads/actions";

export function AddNoteForm({ leadId }: { leadId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  async function onSubmit(formData: FormData) {
    setError(undefined);
    startTransition(async () => {
      const result = await addLeadNote(leadId, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
      router.refresh();
    });
  }

  return (
    <form ref={formRef} action={onSubmit} className="space-y-2">
      <Label htmlFor="note">Add a note</Label>
      <Textarea
        id="note"
        name="note"
        rows={3}
        placeholder="Left voicemail, follow up Thursday. Want Matt on the call."
        required
      />
      {error && <p className="text-xs text-crimson-400">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Log note"}
        </Button>
      </div>
    </form>
  );
}
