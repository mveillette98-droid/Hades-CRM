import { emptyUsage, type Usage } from "./claude";

/** Add one step's token usage to the run's running total. */
export function mergeUsage(prev: Record<string, number> | null, add: Usage): Usage {
  const base = emptyUsage();
  for (const k of Object.keys(base) as (keyof Usage)[]) {
    base[k] = (prev?.[k] ?? 0) + add[k];
  }
  return base;
}
