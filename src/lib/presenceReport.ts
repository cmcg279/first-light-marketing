import type { PresenceRun } from "../types/admin";

export const FACEBOOK_FIELD_HINT =
  "Page URL (for example https://www.facebook.com/VPJebb) or the name from that URL.";

export const FACEBOOK_SPACE_MESSAGE =
  "Facebook takes a page URL or its URL name, with no spaces. For example https://www.facebook.com/VPJebb.";

/** Invisible characters. Keep in sync with readFacebookHandle in api/presence-audit.ts. */
const FACEBOOK_INVISIBLE = /[\u200b-\u200d\u2060\u180e\ufeff]/;

/**
 * Empty is allowed. Surrounding spaces, tabs, and newlines are ignored.
 * A space that remains after trim, or an invisible character in the raw value, is rejected.
 */
export function facebookFieldError(value: string): string | null {
  if (FACEBOOK_INVISIBLE.test(value)) return FACEBOOK_SPACE_MESSAGE;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/\s/.test(trimmed)) return FACEBOOK_SPACE_MESSAGE;
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

/** Fields of the New report form. Retry does not use this draft. */
export type NewReportDraft = {
  company: string;
  website: string;
  instagram: string;
  tiktok: string;
  facebook: string;
  legalName: string;
  area: string;
  service: string;
  googleMaps: string;
  testMode: boolean;
};

export function blankNewReportDraft(defaultTestMode: boolean): NewReportDraft {
  return {
    company: "",
    website: "",
    instagram: "",
    tiktok: "",
    facebook: "",
    legalName: "",
    area: "",
    service: "",
    googleMaps: "",
    testMode: defaultTestMode,
  };
}

/**
 * A successful create returns the blank form, with the free-test checkbox at the
 * configured default. A failed create returns the same draft so the user can fix it.
 */
export function newReportDraftAfterCreate(
  draft: NewReportDraft,
  created: boolean,
  defaultTestMode: boolean,
): NewReportDraft {
  if (!created) return draft;
  return blankNewReportDraft(defaultTestMode);
}

/** Plain pre-submit line. Whitespace counts as empty, matching the value that is sent. */
export function newReportWillUseLine(website: string, googleMaps: string, service = ""): string {
  const site = website.trim() || "No website";
  const maps = googleMaps.trim() || "No Maps link";
  const type = service.trim();
  const base = `Website: ${site}. Maps: ${maps}.`;
  return type ? `${base} Type of business: ${type}.` : base;
}
