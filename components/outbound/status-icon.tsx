import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

export function StatusIcon({ status }: { status: "pass" | "warn" | "fail" }) {
  if (status === "pass") return <CheckCircle2 className="h-4 w-4 shrink-0 text-gold-400" aria-label="Pass" />;
  if (status === "warn") return <AlertTriangle className="h-4 w-4 shrink-0 text-gold-200" aria-label="Warning" />;
  return <XCircle className="h-4 w-4 shrink-0 text-crimson-400" aria-label="Fail" />;
}
