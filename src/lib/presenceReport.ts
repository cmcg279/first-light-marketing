import type { PresenceRun } from "../types/admin";

export const FACEBOOK_FIELD_HINT =
  "Page URL (for example https://www.facebook.com/VPJebb) or the name from that URL.";

export const FACEBOOK_SPACE_MESSAGE =
  "Facebook takes a page URL or its URL name, with no spaces. For example https://www.facebook.com/VPJebb.";

/** Spaces and zero-width characters. Keep in sync with readFacebookHandle in api/presence-audit.ts. */
const FACEBOOK_DISALLOWED = /[\s\u200b-\u200d\u2060\u180e\ufeff]/;

/** Empty is allowed. Spaces and invisible characters are rejected before the form submits. */
export function facebookFieldError(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (FACEBOOK_DISALLOWED.test(value)) return FACEBOOK_SPACE_MESSAGE;
  return null;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/**
 * Cost column for the Reports runs table.
 * Queued and running rows stay an em dash so a reservation is not shown as a cost.
 * A finished row shows the recorded cost_usd total when the run has one.
 */
export function presenceRunCostText(run: Pick<PresenceRun, "status" | "costUsd">): string {
  if (run.status === "queued" || run.status === "running") return "—";
  if (typeof run.costUsd === "number" && Number.isFinite(run.costUsd)) return usd.format(run.costUsd);
  return "—";
}
