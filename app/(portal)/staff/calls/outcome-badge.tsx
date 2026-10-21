import { Badge } from "@/components/ui/badge";
import type { CallOutcome } from "@/lib/phone-agent/transcript";

const VARIANT: Record<CallOutcome, "success" | "warning" | "destructive" | "secondary" | "default"> = {
  Booked: "success",
  "Message taken": "warning",
  "Missed call email": "destructive",
  "No action": "secondary",
  "In progress": "default",
};

export function OutcomeBadge({ outcome }: { outcome: CallOutcome }) {
  return <Badge variant={VARIANT[outcome]}>{outcome}</Badge>;
}
