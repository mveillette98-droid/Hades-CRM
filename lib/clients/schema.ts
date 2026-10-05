import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : null));

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Firm name is required"),
  vertical: z.string().trim().min(1, "Vertical is required"),
  website_url: optionalText,
  company_size: optionalText,
  location: optionalText,
  known_competitors: optionalText,
  current_marketing: optionalText,
  status: z.enum(["onboarding", "active", "paused", "churned"]),
  monthly_retainer: z
    .union([z.string(), z.number()])
    .transform((v) => {
      if (typeof v === "number") return v;
      const n = Number.parseFloat(v.replace(/[^0-9.-]/g, "") || "0");
      return Number.isFinite(n) ? n : 0;
    })
    .pipe(z.number().min(0, "Must be zero or more")),
  offer: optionalText,
  icp: optionalText,
  pain_points: optionalText,
  differentiators: optionalText,
  proof: optionalText,
  voice: optionalText,
  avoid: optionalText,
  notes: optionalText,
});

export type ClientValues = z.output<typeof clientSchema>;
