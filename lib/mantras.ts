/**
 * Hades Blueprint mantras.
 *
 * Short, harsh, execution-focused. Rotated daily on the dashboard to
 * remind the operator to stay relentless. Edit freely — shorter is
 * better. If a line wouldn't come out of your mouth at 7am with your
 * phone in your hand, delete it.
 */

export const MANTRAS: readonly string[] = [
  "Pick up the fucking phone.",
  "No dial, no deal.",
  "Be harsh. Be driven. Execute.",
  "Comfort is the tax on every deal you didn't close.",
  "One call away from this month looking different.",
  "The pipeline doesn't move itself.",
  "Sharpen up. Send it.",
  "Stop refreshing. Start dialing.",
  "Proposals don't sign themselves — follow the fuck up.",
  "If it's not in the CRM, it didn't happen.",
  "Slow is expensive.",
  "Your next 10 calls decide the month.",
  "Build. Close. Deliver. Repeat.",
  "Boring discipline beats loud intention.",
  "Cold outreach is a rep, not a mood.",
  "Every unread follow-up is money sitting on the table.",
  "Winners are relentless — and quiet about it.",
  "No excuses above the fold.",
  "The best time to call was yesterday. The second best is right now.",
  "Revenue rewards motion, not planning.",
  "You chose this. Act like it.",
  "The game rewards reps. Get to the reps.",
] as const;

/**
 * Pick a stable mantra for a given date.
 * Same date → same mantra, so it feels like "today's line" instead of flicker.
 */
export function mantraForDate(date: Date = new Date()): string {
  // Day number since epoch — stable within a calendar day in the server's TZ.
  const day = Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
  return MANTRAS[day % MANTRAS.length]!;
}
