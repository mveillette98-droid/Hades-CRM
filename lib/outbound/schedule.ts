/**
 * Send windows. Everything is computed in the campaign's time zone so a
 * "9 to 5, Monday to Friday" campaign behaves the same wherever the sender
 * script runs.
 */
export interface WindowConfig {
  timezone: string;
  window_start: number; // hour, inclusive
  window_end: number;   // hour, exclusive
  send_days: number[];  // 1 = Monday … 7 = Sunday
}

const WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function localParts(date: Date, timezone: string): { weekday: number; hour: number } {
  const tz = isValidTimezone(timezone) ? timezone : "America/New_York";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekday = WEEKDAY[parts.find((p) => p.type === "weekday")?.value ?? "Mon"] ?? 1;
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  return { weekday, hour };
}

export function inWindow(date: Date, cfg: WindowConfig): boolean {
  const { weekday, hour } = localParts(date, cfg.timezone);
  return cfg.send_days.includes(weekday) && hour >= cfg.window_start && hour < cfg.window_end;
}

/** First moment at or after `date` that falls inside the window (15 min steps). */
export function nextWindowStart(date: Date, cfg: WindowConfig): Date | null {
  if (cfg.send_days.length === 0 || cfg.window_end <= cfg.window_start) return null;
  const step = 15 * 60 * 1000;
  let t = date.getTime();
  for (let i = 0; i < 8 * 24 * 4; i++) {
    const d = new Date(t);
    if (inWindow(d, cfg)) return d;
    t = Math.ceil((t + 1) / step) * step;
  }
  return null;
}

const DAY = 24 * 60 * 60 * 1000;

/** When the next step is due, given when this one went out. */
export function followupAt(sentAt: Date, thisDay: number, nextDay: number, jitterMinutes = 0): Date {
  const gapDays = Math.max(1, nextDay - thisDay);
  return new Date(sentAt.getTime() + gapDays * DAY + jitterMinutes * 60 * 1000);
}

export function describeWindow(cfg: WindowConfig): string {
  const names = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const days = [...cfg.send_days].sort().map((d) => names[d]).join(", ");
  const h = (n: number) => `${((n + 11) % 12) + 1}${n < 12 || n === 24 ? "am" : "pm"}`;
  return `${days}, ${h(cfg.window_start)} to ${h(cfg.window_end)} (${cfg.timezone})`;
}
