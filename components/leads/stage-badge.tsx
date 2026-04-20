import { Badge } from "@/components/ui/badge";
import type { PipelineStage } from "@/lib/supabase/types";

export function StageBadge({
  stage,
}: {
  stage: Pick<PipelineStage, "name" | "is_won" | "is_lost"> | null;
}) {
  if (!stage) return <Badge variant="outline">—</Badge>;
  if (stage.is_won) return <Badge variant="won">{stage.name}</Badge>;
  if (stage.is_lost) return <Badge variant="lost">{stage.name}</Badge>;
  return <Badge variant="crimson">{stage.name}</Badge>;
}
