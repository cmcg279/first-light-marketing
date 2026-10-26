/**
 * Admin API for the social audit worker (`social_audit.job.handler`).
 *
 * The job we send is the object `validate_job` accepts. The worker writes
 * `runs/<business_id>/<run_id>/{report.pdf,snapshot.json,result.json}` and a
 * status row `PK=BIZ#<business_id>`, `SK=RUN#<run_id>`, `GSI1PK=RUNS`.
 * A `bad_input` result is returned by the function and is not written when the
 * ids are not a ULID and a slug, so the invoke response is applied before we
 * leave the run queued. See docs/AUDIT_REPORTS.md.
 */

import { randomBytes } from "node:crypto";

export const PRESENCE_SPEND_PK = "PRESENCE_SPEND";
export const PRESENCE_LOCK_PK = "LOCK#presence-audit";
export const PRESENCE_LOCK_SK = "LOCK";
export const IN_PROGRESS_MESSAGE = "A run is already in progress.";
export const RUNS_INDEX = "GSI1";
export const RUNS_PARTITION = "RUNS";
export const DEFAULT_RUN_ESTIMATE_USD = 6;
export const DEFAULT_BRAND = "first_light";
export const BRAND_IDS = ["first_light", "example_brand"] as const;
export const RUN_TIMEOUT_MS = 16 * 60 * 1000;
export const SCHEMA = 1;

const ULID_CHARS = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const SLUG = /^[a-z0-9-]{2,60}$/;
const HANDLE_RULES = {
  instagram: { pattern: /^[A-Za-z0-9._]{1,30}$/, what: "an Instagram handle" },
  tiktok: { pattern: /^[A-Za-z0-9._]{2,24}$/, what: "a TikTok handle" },
} as const;
const JOB_KEYS = new Set([
  "schema",
  "run_id",
  "business_id",
  "requested_by",
  "kind",
  "company",
  "website",
  "handles",
  "brand",
  "options",
  "test_mode",
]);
const REQUEST_KEYS = new Set([
  "company",
  "website",
  "handles",
  "business",
  "area",
  "testMode",
  "test_mode",
  "compareToRunId",
  "compare_to_run_id",
  "businessId",
  "business_id",
]);
const FAILURE_TEXT: Record<string, string> = {
  website_not_fetched: "The website was not fetched.",
  listing_match_not_high: "The Google listing match was not high enough.",
  no_ai_answers: "AI search did not return answers.",
  pagespeed_not_attempted: "PageSpeed was not attempted.",
  pdf_not_checked: "The PDF text was not checked.",
  too_many_pages: "The report is longer than 35 pages.",
  pdf_text_yaml_name: "The PDF still contains a raw YAML name.",
  pdf_text_insight_id: "The PDF still contains an insight id.",
  pdf_text_none_value: "The PDF still contains a raw none value.",
  pdf_text_snake_case_id: "The PDF still contains a snake_case id.",
};
const ERROR_TEXT: Record<string, string> = {
  bad_input: "The job was rejected before it ran.",
  website_unreachable: "The website could not be fetched.",
  social_required: "A required social profile was missing, so the run was cancelled.",
  timeout: "The report ran out of time.",
  internal: "The report failed inside the worker.",
  start_failed: "The worker could not start the report.",
};
const TRACKING_STOPPED =
  "Tracking stopped. The worker has no cancel, so this report may still be running and the spend may already be committed. Another report cannot start until this one finishes or 16 minutes have passed.";
const FACEBOOK_WHITESPACE =
  "Facebook takes a page URL or its URL name, with no spaces. For example https://www.facebook.com/VPJebb.";

export type PortalClaim = "timeout" | "bad_input" | "start_failed";
export type PresenceStatus = "queued" | "running" | "succeeded" | "needs_review" | "failed" | "cancelled";
export type PresenceCostSource = "test" | "estimate" | "worker" | "released";
export type PresenceCostLabel = "Free" | "Estimated" | "Actual" | "Released";
export type PresenceStatusLabel =
  | "Queued"
  | "Running"
  | "Completed"
  | "Needs review"
  | "Failed"
  | "Cancelled"
  | "Not tracked";

export interface PresenceHandles {
  instagram?: string;
  tiktok?: string;
  facebook?: string;
}

export interface WorkerJob {
  schema: number;
  run_id: string;
  business_id: string;
  requested_by: string;
  kind: "admin";
  company: string;
  website: string;
  handles: PresenceHandles;
  brand: string;
  options: Record<string, unknown>;
  test_mode: boolean;
}

export interface PresenceRun {
  id: string;
  businessId: string;
  company: string;
  website: string;
  handles: PresenceHandles;
  business: string;
  area: string;
  brand: string;
  requestedBy: string;
  compareToRunId?: string;
  testMode: boolean;
  status: PresenceStatus;
  errorCode?: string;
  errorMessage?: string;
  qualityFailures: string[];
  fileName: string;
  pdfKey?: string;
  reservedCents: number;
  costSource: PresenceCostSource;
  costUsd?: number;
  month: string;
  trackingStopped: boolean;
  createdAt: string;
  startedAt?: string;
  updatedAt: string;
  finishedAt?: string;
}

export interface PresenceConfig {
  capUsd: number;
  capCents: number;
  estimateUsd: number;
  estimateCents: number;
  realRunsEnabled: boolean;
  defaultTestMode: boolean;
  workerConfigured: boolean;
  bucket: string;
}

export interface PresenceSpendSummary {
  month: string;
  monthToDateUsd: number;
  capUsd: number;
  estimatePerRunUsd: number;
  realRunsEnabled: boolean;
  workerConfigured: boolean;
  defaultTestMode: boolean;
}

export interface SpendReservation {
  month: string;
  deltaCents: number;
  mode: "reserve" | "release" | "reconcile";
  capCents: number;
}

export interface InvokeOutcome {
  statusCode: number;
  functionError?: string;
  payload: Record<string, unknown> | null;
}

export interface PresenceRunLock {
  holder: string;
  expiresAt: string;
}

export interface PresenceStore {
  listRuns(): Promise<PresenceRun[]>;
  getRun(id: string): Promise<PresenceRun | null>;
  monthSpendCents(month: string): Promise<number>;
  insertRun(run: PresenceRun, reservation: SpendReservation | null): Promise<void>;
  saveRun(run: PresenceRun, reservation: SpendReservation | null, claim: PortalClaim | null): Promise<void>;
  getRunLock(): Promise<PresenceRunLock | null>;
  acquireRunLock(runId: string, now: Date): Promise<boolean>;
  releaseRunLock(runId: string): Promise<void>;
  readObject(key: string): Promise<Record<string, unknown> | null>;
  pdfExists(key: string): Promise<boolean>;
  invoke(payload: WorkerJob): Promise<InvokeOutcome>;
  presign(key: string, downloadName: string): Promise<string>;
}

export interface PresenceRequest {
  method: string;
  path: string;
  body?: string;
  config: PresenceConfig;
  now?: Date;
  newId?: (nowMs: number) => string;
  authorize: () => Promise<string>;
  store: PresenceStore;
}

export interface Projection {
  run: PresenceRun;
  costDeltaCents: number;
  claim: PortalClaim | null;
}

export class PresenceError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "PresenceError";
    this.statusCode = statusCode;
  }
}

const LIST_PATH = "/api/admin/presence/runs";
const DOWNLOAD_SECONDS = 300;

export function isPresenceAdminRoute(method: string, path: string) {
  void method;
  return path === LIST_PATH || path.startsWith(`${LIST_PATH}/`);
}

export function loadPresenceConfig(env: Record<string, string | undefined>): PresenceConfig {
  // Unset, blank, 0, or unreadable means no monthly cap. A positive value turns the cap on.
  const capUsd = readDecimal(env.AUDIT_MONTHLY_CAP_USD, 0, 0, 100_000);
  const estimateUsd = readDecimal(env.AUDIT_RUN_COST_ESTIMATE_USD, DEFAULT_RUN_ESTIMATE_USD, 0.01, 100_000);
  return {
    capUsd,
    capCents: toCents(capUsd),
    estimateUsd,
    estimateCents: toCents(estimateUsd),
    realRunsEnabled: env.AUDIT_REAL_RUNS_ENABLED === "true",
    defaultTestMode: env.PRESENCE_DEFAULT_TEST_MODE !== "false",
    workerConfigured: Boolean(env.AUDIT_WORKER_FUNCTION_NAME?.trim() && env.AUDIT_REPORTS_BUCKET_NAME?.trim()),
    bucket: env.AUDIT_REPORTS_BUCKET_NAME?.trim() || "",
  };
}

export function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function capBlocks(monthCents: number, reserveCents: number, capCents: number) {
  if (capCents <= 0 || reserveCents <= 0) return false;
  return monthCents + reserveCents > capCents;
}

/** Integer cents of a worker `cost_usd` figure. No currency conversion. */
export function usdToCents(usd: number) {
  if (!Number.isFinite(usd) || usd < 0) return 0;
  return Math.round(usd * 100);
}

export function newRunId(nowMs = Date.now(), bytes?: Uint8Array) {
  const random = bytes && bytes.length === 10 ? bytes : randomBytes(10);
  let rnd = 0n;
  for (const byte of random) rnd = (rnd << 8n) | BigInt(byte);
  const n = (BigInt(nowMs) << 80n) | rnd;
  let out = "";
  for (let i = 25; i >= 0; i -= 1) out += ULID_CHARS[Number((n >> BigInt(5 * i)) & 31n)];
  return out;
}

export function slugifyBusinessId(company: string) {
  const slug = company
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  if (!SLUG.test(slug)) {
    throw new PresenceError(422, "business_id must be 2 to 60 lowercase letters, digits or hyphens");
  }
  return slug;
}

/** Same acceptance rules as the worker's `validate_job`. Unknown keys are rejected. */
export function validateJob(event: unknown): WorkerJob {
  if (!event || typeof event !== "object" || Array.isArray(event)) fail("the job must be a JSON object");
  const job = event as Record<string, unknown>;
  rejectUnknown(job, JOB_KEYS, "job");
  if (job.schema !== undefined && job.schema !== SCHEMA) fail(`schema must be ${SCHEMA}`);

  const companyRaw = job.company;
  if (typeof companyRaw !== "string" || !companyRaw.trim() || companyRaw.length > 120) {
    fail("company is required (at most 120 characters)");
  }
  const company = companyRaw.trim().split(/\s+/).join(" ");
  const website = checkWebsite(job.website);

  const runId = job.run_id === undefined ? newRunId() : job.run_id;
  if (typeof runId !== "string" || !ULID.test(runId)) fail("run_id must be a 26-character ULID");
  const businessId = job.business_id === undefined ? slugifyBusinessId(company) : job.business_id;
  if (typeof businessId !== "string" || !SLUG.test(businessId)) {
    fail("business_id must be 2 to 60 lowercase letters, digits or hyphens");
  }
  const kind = job.kind === undefined ? "admin" : job.kind;
  if (kind !== "admin" && kind !== "self_serve") fail("kind must be 'admin' or 'self_serve'");
  const requestedBy = job.requested_by === undefined ? "local" : job.requested_by;
  if (typeof requestedBy !== "string" || !requestedBy || requestedBy.length > 200) {
    fail("requested_by must be a short string");
  }
  const testMode = optionalBool(job, "test_mode", "job", false);

  const handlesIn = job.handles === undefined || job.handles === null ? {} : job.handles;
  if (!handlesIn || typeof handlesIn !== "object" || Array.isArray(handlesIn)) fail("handles must be an object");
  rejectUnknown(handlesIn as Record<string, unknown>, new Set(["instagram", "tiktok", "facebook"]), "handles");
  const handles: PresenceHandles = {};
  for (const key of ["instagram", "tiktok"] as const) {
    const value = (handlesIn as Record<string, unknown>)[key];
    if (value === undefined || value === null || value === "") continue;
    const rule = HANDLE_RULES[key];
    if (typeof value !== "string" || !rule.pattern.test(value.trim().replace(/^@/, ""))) {
      fail(`handles.${key} must be ${rule.what}`);
    }
    handles[key] = value.trim().replace(/^@/, "");
  }
  const facebook = readFacebookHandle((handlesIn as Record<string, unknown>).facebook);
  if (facebook) handles.facebook = facebook;

  let brand: string | null = null;
  if (job.brand !== undefined && job.brand !== null) {
    if (typeof job.brand !== "string" || !BRAND_IDS.includes(job.brand as (typeof BRAND_IDS)[number])) {
      fail("brand is not one of the configured brands");
    }
    brand = job.brand;
  }

  const optionsIn = job.options === undefined || job.options === null ? {} : job.options;
  if (!optionsIn || typeof optionsIn !== "object" || Array.isArray(optionsIn)) fail("options must be an object");
  const options = optionsIn as Record<string, unknown>;
  rejectUnknown(
    options,
    new Set([
      "business",
      "no_social",
      "max_posts",
      "require_social",
      "competitors",
      "reviews",
      "ai",
      "budget_usd",
      "force_fresh",
      "compare_to_run_id",
    ]),
    "options",
  );
  const compareTo = optionalString(options, "compare_to_run_id", 26, "options");
  if (compareTo && !ULID.test(compareTo)) fail("options.compare_to_run_id must be a 26-character ULID");
  const noSocial = Boolean(optionalBool(options, "no_social", "options", false));
  if (noSocial && (handles.instagram || handles.tiktok || handles.facebook)) {
    fail("options.no_social cannot be combined with social handles");
  }
  checkOptions(options);

  if (kind === "self_serve") {
    fail("a self-serve job cannot be started from this admin API");
  }

  return {
    schema: SCHEMA,
    run_id: runId,
    business_id: businessId,
    requested_by: requestedBy,
    kind: "admin",
    company,
    website,
    handles,
    brand: brand || DEFAULT_BRAND,
    options: normalOptions(options, compareTo),
    test_mode: Boolean(testMode),
  };
}

export function workerPayload(run: PresenceRun): WorkerJob {
  return validateJob({
    schema: SCHEMA,
    run_id: run.id,
    business_id: run.businessId,
    requested_by: run.requestedBy,
    kind: "admin",
    company: run.company,
    website: run.website,
    handles: run.handles,
    brand: run.brand || DEFAULT_BRAND,
    options: {
      ...(run.business ? { business: run.business } : {}),
      ...(run.area ? { competitors: { area: run.area } } : {}),
      ...(run.compareToRunId ? { compare_to_run_id: run.compareToRunId } : {}),
    },
    test_mode: run.testMode,
  });
}

export function resultObjectKey(run: Pick<PresenceRun, "businessId" | "id">) {
  return `runs/${run.businessId}/${run.id}/result.json`;
}

export function pdfObjectKey(run: Pick<PresenceRun, "businessId" | "id">) {
  return `runs/${run.businessId}/${run.id}/report.pdf`;
}

export function runsIndexQuery(tableName: string, exclusiveStartKey?: Record<string, unknown>) {
  return {
    TableName: tableName,
    IndexName: RUNS_INDEX,
    KeyConditionExpression: "GSI1PK = :pk",
    ExpressionAttributeValues: { ":pk": RUNS_PARTITION },
    ScanIndexForward: false,
    ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
  };
}

export function runLookupQuery(tableName: string, runId: string, exclusiveStartKey?: Record<string, unknown>) {
  return {
    TableName: tableName,
    IndexName: RUNS_INDEX,
    KeyConditionExpression: "GSI1PK = :pk",
    FilterExpression: "SK = :sk",
    ExpressionAttributeValues: { ":pk": RUNS_PARTITION, ":sk": `RUN#${runId}` },
    ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
  };
}

export function runToItem(run: PresenceRun, job: WorkerJob) {
  const storedJob = { ...job } as Record<string, unknown>;
  delete storedJob.requested_by;
  return {
    PK: `BIZ#${run.businessId}`,
    SK: `RUN#${run.id}`,
    GSI1PK: RUNS_PARTITION,
    GSI1SK: `${run.createdAt}#${run.id}`,
    status: run.status,
    test_mode: run.testMode,
    kind: "admin",
    requested_by: run.requestedBy,
    job: storedJob,
    flReservedCents: run.reservedCents,
    flCostSource: run.costSource,
    flMonth: run.month,
    flTracked: !run.trackingStopped,
    flCreatedAt: run.createdAt,
    flUpdatedAt: run.updatedAt,
    flFileName: run.fileName,
    ...(run.costUsd !== undefined ? { flCostUsd: run.costUsd } : {}),
    ...(run.errorCode ? { error: { code: run.errorCode, message: run.errorMessage || "" } } : {}),
  };
}

export function runFromItem(item: Record<string, unknown>): PresenceRun | null {
  const pk = text(item.PK);
  const sk = text(item.SK);
  if (!pk.startsWith("BIZ#") || !sk.startsWith("RUN#")) return null;
  const businessId = pk.slice("BIZ#".length);
  const id = sk.slice("RUN#".length);
  if (!SLUG.test(businessId) || !ULID.test(id)) return null;

  const job = item.job && typeof item.job === "object" && !Array.isArray(item.job) ? (item.job as Record<string, unknown>) : {};
  const options =
    job.options && typeof job.options === "object" && !Array.isArray(job.options)
      ? (job.options as Record<string, unknown>)
      : {};
  const competitors =
    options.competitors && typeof options.competitors === "object" && !Array.isArray(options.competitors)
      ? (options.competitors as Record<string, unknown>)
      : {};
  const handlesIn =
    job.handles && typeof job.handles === "object" && !Array.isArray(job.handles)
      ? (job.handles as Record<string, unknown>)
      : {};
  const error = item.error && typeof item.error === "object" && !Array.isArray(item.error) ? (item.error as Record<string, unknown>) : {};
  const gate =
    item.quality_gate && typeof item.quality_gate === "object" && !Array.isArray(item.quality_gate)
      ? (item.quality_gate as Record<string, unknown>)
      : {};
  const status = knownStatus(item.status) || "queued";
  const testMode = typeof item.test_mode === "boolean" ? item.test_mode : Boolean(job.test_mode);
  const costSource = knownCost(item.flCostSource) || (testMode ? "test" : "estimate");
  const createdAt = text(item.flCreatedAt) || text(item.started_at) || new Date(0).toISOString();
  const company = text(job.company) || businessId;
  const website = text(job.website);
  const costUsd = readCostUsd(item.cost_usd) ?? (typeof item.flCostUsd === "number" ? item.flCostUsd : undefined);

  return {
    id,
    businessId,
    company,
    website,
    handles: {
      ...(typeof handlesIn.instagram === "string" ? { instagram: handlesIn.instagram } : {}),
      ...(typeof handlesIn.tiktok === "string" ? { tiktok: handlesIn.tiktok } : {}),
      ...(typeof handlesIn.facebook === "string" ? { facebook: handlesIn.facebook } : {}),
    },
    business: text(options.business),
    area: text(competitors.area),
    brand: text(job.brand) || DEFAULT_BRAND,
    requestedBy: text(item.requested_by) || "admin",
    compareToRunId: typeof options.compare_to_run_id === "string" ? options.compare_to_run_id : undefined,
    testMode,
    status,
    errorCode: text(error.code) || undefined,
    errorMessage: text(error.message) || undefined,
    qualityFailures: stringList(gate.failures),
    fileName: text(item.flFileName) || pdfFileName(company),
    pdfKey: pdfKeyFor(businessId, id, status, item.artifacts),
    reservedCents: typeof item.flReservedCents === "number" ? Math.max(0, Math.round(item.flReservedCents)) : 0,
    costSource,
    costUsd,
    month: text(item.flMonth) || monthKey(new Date(createdAt)),
    trackingStopped: item.flTracked === false,
    createdAt,
    startedAt: text(item.started_at) || undefined,
    updatedAt: text(item.flUpdatedAt) || text(item.finished_at) || createdAt,
    finishedAt: text(item.finished_at) || undefined,
  };
}

export function overlayWorkerResult(run: PresenceRun, raw: Record<string, unknown> | null): PresenceRun {
  if (!raw) return run;
  const status = knownStatus(raw.status);
  if (!status) return run;
  const error = raw.error && typeof raw.error === "object" && !Array.isArray(raw.error) ? (raw.error as Record<string, unknown>) : {};
  const gate =
    raw.quality_gate && typeof raw.quality_gate === "object" && !Array.isArray(raw.quality_gate)
      ? (raw.quality_gate as Record<string, unknown>)
      : {};
  const costUsd = readCostUsd(raw.cost_usd);
  return {
    ...run,
    status,
    testMode: typeof raw.test_mode === "boolean" ? raw.test_mode : run.testMode,
    errorCode: text(error.code) || (status === "succeeded" || status === "needs_review" ? undefined : run.errorCode),
    errorMessage: text(error.message) || (status === "succeeded" ? undefined : run.errorMessage),
    qualityFailures: Array.isArray(gate.failures) ? stringList(gate.failures) : run.qualityFailures,
    costUsd: costUsd !== undefined ? costUsd : run.costUsd,
    startedAt: text(raw.started_at) || run.startedAt,
    finishedAt: text(raw.finished_at) || run.finishedAt,
    pdfKey: pdfKeyFor(run.businessId, run.id, status, raw.artifacts) || run.pdfKey,
    updatedAt: text(raw.finished_at) || run.updatedAt,
  };
}

export function projectRun(run: PresenceRun, now: Date, config: PresenceConfig): Projection {
  const nowIso = now.toISOString();
  let next: PresenceRun = { ...run, qualityFailures: [...run.qualityFailures], handles: { ...run.handles } };
  let claim: PortalClaim | null = null;
  const open = next.status === "queued" || next.status === "running";
  const started = Date.parse(next.startedAt || next.createdAt);
  if (open && Number.isFinite(started) && now.getTime() - started > RUN_TIMEOUT_MS) {
    next = {
      ...next,
      status: "failed",
      errorCode: "timeout",
      errorMessage: ERROR_TEXT.timeout,
      finishedAt: nowIso,
      updatedAt: nowIso,
    };
    claim = "timeout";
  }

  let costDeltaCents = 0;
  const reported = !next.testMode && isTerminal(next.status) && typeof next.costUsd === "number" && next.costSource !== "worker";
  const releaseEstimate =
    !next.testMode &&
    next.costSource === "estimate" &&
    next.reservedCents > 0 &&
    (next.status === "failed" || next.status === "cancelled" || claim === "timeout");
  if (reported && typeof next.costUsd === "number") {
    const target = usdToCents(next.costUsd);
    costDeltaCents = target - next.reservedCents;
    next = { ...next, reservedCents: target, costSource: "worker", updatedAt: nowIso };
  } else if (releaseEstimate) {
    costDeltaCents = -next.reservedCents;
    next = { ...next, reservedCents: 0, costSource: "released", updatedAt: nowIso };
  }

  return { run: next, costDeltaCents, claim };
}

export function publicRun(run: PresenceRun) {
  const notTracked = run.trackingStopped && (run.status === "queued" || run.status === "running");
  const handles = {
    instagram: run.handles.instagram || "",
    tiktok: run.handles.tiktok || "",
    facebook: run.handles.facebook || "",
  };
  return {
    id: run.id,
    businessId: run.businessId,
    company: run.company,
    website: run.website,
    handles,
    business: run.business,
    area: run.area,
    testMode: run.testMode,
    status: run.status,
    statusLabel: statusLabel(run.status, notTracked),
    completed: run.status === "succeeded",
    errorCode: notTracked ? "tracking_stopped" : run.errorCode,
    errorMessage: notTracked ? TRACKING_STOPPED : run.errorMessage,
    qualityFailures: run.qualityFailures,
    statusMessage: notTracked ? TRACKING_STOPPED : describeRun(run),
    fileName: run.fileName,
    estimatedCostUsd: run.testMode ? 0 : centsToUsd(run.reservedCents),
    costUsd: run.testMode ? 0 : run.costUsd,
    costLabel: costLabel(run),
    trackingStopped: run.trackingStopped,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    finishedAt: run.finishedAt,
    downloadReady: run.status === "succeeded" && run.pdfKey === pdfObjectKey(run),
  };
}

export function describeRun(run: PresenceRun) {
  if (run.status === "needs_review") {
    const reasons = run.qualityFailures.map(failureMessage);
    return reasons.length
      ? `Needs review. ${reasons.join(" ")} The report was produced, but it is not a completed report.`
      : "Needs review. The report failed a readiness check, so it is not a completed report.";
  }
  if (run.status === "failed" || run.status === "cancelled") {
    const known = run.errorCode ? ERROR_TEXT[run.errorCode] : "";
    const detail = safeDetail(run.errorMessage);
    if (known && detail && detail !== known) return `${known} ${detail}`;
    return known || detail || (run.status === "cancelled" ? "The run was cancelled." : "The report failed.");
  }
  if (run.status === "succeeded") return "Completed.";
  if (run.status === "running") return "Running.";
  return "Queued. Waiting for the worker to write its status row.";
}

export async function handlePresenceRequest(input: PresenceRequest): Promise<{ statusCode: number; body: unknown }> {
  try {
    const requestedBy = await input.authorize();
    const action = matchAction(input.method, normalizePath(input.path));
    if (!action) return json(404, { error: "Not found" });
    const now = input.now ?? new Date();
    switch (action.kind) {
      case "list":
        return await listRuns(input, now);
      case "create":
        return await createRun(input, now, requestedBy, null);
      case "get":
        return await getRun(input, action.id, now);
      case "download":
        return await downloadRun(input, action.id, now);
      case "cancel":
        return await cancelRun(input, action.id, now);
      case "retry":
        return await retryRun(input, action.id, now, requestedBy);
      default:
        return json(404, { error: "Not found" });
    }
  } catch (error) {
    const http = asHttpError(error);
    if (http) return json(http.statusCode, { error: http.message });
    throw error;
  }
}

function matchAction(method: string, path: string) {
  if (path === LIST_PATH && method === "GET") return { kind: "list" as const };
  if (path === LIST_PATH && method === "POST") return { kind: "create" as const };
  const parts = path.split("/").filter(Boolean);
  if (parts.length < 5 || parts[0] !== "api" || parts[1] !== "admin" || parts[2] !== "presence" || parts[3] !== "runs") {
    return null;
  }
  const id = parts[4];
  if (!ULID.test(id)) return null;
  if (parts.length === 5 && method === "GET") return { kind: "get" as const, id };
  if (parts.length === 6 && method === "POST" && parts[5] === "download") return { kind: "download" as const, id };
  if (parts.length === 6 && method === "POST" && parts[5] === "cancel") return { kind: "cancel" as const, id };
  if (parts.length === 6 && method === "POST" && parts[5] === "retry") return { kind: "retry" as const, id };
  return null;
}

async function listRuns(input: PresenceRequest, now: Date) {
  const runs = await input.store.listRuns();
  let reads = 0;
  const next: PresenceRun[] = [];
  for (const run of runs) {
    const open = run.status === "queued" || run.status === "running";
    const refreshed = await refreshRun(input, run, now, open && reads < 15);
    await releaseLockIfFinished(input, refreshed);
    next.push(refreshed);
    if (open) reads += 1;
  }
  next.sort((a, b) => (b.startedAt || b.createdAt).localeCompare(a.startedAt || a.createdAt));
  const month = monthKey(now);
  const spent = await input.store.monthSpendCents(month);
  return json(200, { runs: next.map(publicRun), spend: spendSummary(input.config, month, spent) });
}

async function getRun(input: PresenceRequest, id: string, now: Date) {
  const refreshed = await refreshRun(input, await requireRun(input, id), now, true);
  await releaseLockIfFinished(input, refreshed);
  const month = monthKey(now);
  const spent = await input.store.monthSpendCents(month);
  return json(200, { run: publicRun(refreshed), spend: spendSummary(input.config, month, spent) });
}

async function createRun(input: PresenceRequest, now: Date, requestedBy: string, previous: PresenceRun | null) {
  assertWorker(input.config);
  const requested = previous ? requestFromRun(previous) : parseRunInput(input.body, input.config);
  assertRealAllowed(input.config, requested.testMode);

  const stamp = now.toISOString();
  const month = monthKey(now);
  const id = (input.newId ?? newRunId)(now.getTime());
  if (!ULID.test(id)) throw new PresenceError(500, "Could not allocate a run id.");
  const businessId = requested.businessId;
  await settleStaleRuns(input, now);
  if (await runInProgress(input, now)) throw new PresenceError(409, IN_PROGRESS_MESSAGE);

  const capOn = input.config.capCents > 0;
  const reserveCents = requested.testMode || !capOn ? 0 : input.config.estimateCents;
  const spent = await input.store.monthSpendCents(month);
  if (capOn && capBlocks(spent, reserveCents, input.config.capCents)) {
    throw new PresenceError(409, capMessage(input.config, spent));
  }

  const run: PresenceRun = {
    id,
    businessId,
    company: requested.company,
    website: requested.website,
    handles: requested.handles,
    business: requested.business,
    area: requested.area,
    brand: DEFAULT_BRAND,
    requestedBy: requestedBy.slice(0, 200),
    compareToRunId: previous ? previous.id : requested.compareToRunId,
    testMode: requested.testMode,
    status: "queued",
    qualityFailures: [],
    fileName: pdfFileName(requested.company),
    reservedCents: reserveCents,
    costSource: requested.testMode ? "test" : "estimate",
    month,
    trackingStopped: false,
    createdAt: stamp,
    updatedAt: stamp,
  };
  validateJob(workerPayload(run));

  const reservation = reserveCents > 0 ? reserve(month, reserveCents, input.config.capCents) : null;
  await releaseLockForFinishedHolder(input, now);
  if (!(await input.store.acquireRunLock(id, now))) throw new PresenceError(409, IN_PROGRESS_MESSAGE);
  try {
    try {
      await input.store.insertRun(run, reservation);
    } catch (error) {
      if (asHttpError(error)?.statusCode === 409) throw new PresenceError(409, capMessage(input.config, spent));
      throw error;
    }

    const started = await dispatch(input, run, reservation, now);
    await releaseLockIfFinished(input, started);
    const latestSpend = await input.store.monthSpendCents(month);
    return json(200, { run: publicRun(started), spend: spendSummary(input.config, month, latestSpend) });
  } catch (error) {
    const current = await input.store.getRun(id).catch(() => null);
    if (!current || isTerminal(current.status)) await input.store.releaseRunLock(id);
    throw error;
  }
}

async function downloadRun(input: PresenceRequest, id: string, now: Date) {
  const run = await refreshRun(input, await requireRun(input, id), now, true);
  if (run.status !== "succeeded" || run.pdfKey !== pdfObjectKey(run)) {
    throw new PresenceError(409, "The report is not ready to download yet.");
  }
  if (!(await input.store.pdfExists(run.pdfKey))) {
    throw new PresenceError(409, "The report is not ready to download yet.");
  }
  const downloadUrl = await input.store.presign(run.pdfKey, safeDownloadName(run.fileName));
  return json(200, { downloadUrl, expiresIn: DOWNLOAD_SECONDS });
}

async function cancelRun(input: PresenceRequest, id: string, now: Date) {
  const current = await refreshRun(input, await requireRun(input, id), now, true);
  if (isTerminal(current.status)) throw new PresenceError(409, "This run has already finished.");
  if (current.trackingStopped) {
    const spent = await input.store.monthSpendCents(current.month);
    return json(200, { run: publicRun(current), spend: spendSummary(input.config, current.month, spent) });
  }
  const next: PresenceRun = { ...current, trackingStopped: true, updatedAt: now.toISOString() };
  let reservation: SpendReservation | null = null;
  if (!next.testMode && next.costSource === "estimate" && next.reservedCents > 0) {
    reservation = { month: next.month, deltaCents: -next.reservedCents, mode: "release", capCents: input.config.capCents };
    next.reservedCents = 0;
    next.costSource = "released";
  }
  await input.store.saveRun(next, reservation, null);
  const spent = await input.store.monthSpendCents(current.month);
  return json(200, { run: publicRun(next), spend: spendSummary(input.config, current.month, spent) });
}

async function retryRun(input: PresenceRequest, id: string, now: Date, requestedBy: string) {
  const current = await refreshRun(input, await requireRun(input, id), now, true);
  if (current.status !== "failed" && current.status !== "cancelled" && current.status !== "needs_review") {
    throw new PresenceError(409, "Only a failed, cancelled, or needs-review run can be retried.");
  }
  return createRun(input, now, requestedBy, current);
}

async function dispatch(input: PresenceRequest, run: PresenceRun, reservation: SpendReservation | null, now: Date) {
  const payload = workerPayload(run);
  let outcome: InvokeOutcome;
  try {
    outcome = await input.store.invoke(payload);
  } catch (error) {
    if (asHttpError(error)?.statusCode === 503) throw error;
    console.error("Presence worker invoke failed.");
    const failed = await failOpen(input, run, "start_failed", "The worker could not start the report.", reservation, now);
    void failed;
    throw new PresenceError(502, "The worker could not start the report.");
  }

  if ((outcome.statusCode !== 202 && outcome.statusCode !== 200) || outcome.functionError) {
    console.error("Presence worker invoke was rejected.");
    await failOpen(input, run, "start_failed", "The worker could not start the report.", reservation, now);
    throw new PresenceError(502, "The worker could not start the report.");
  }

  const inspected = outcome.payload ? overlayWorkerResult(run, outcome.payload) : await input.store.getRun(run.id);
  const current = inspected || run;
  if (current.errorCode === "bad_input" || (current.status === "failed" && current !== run)) {
    const projected = projectRun(current, now, input.config);
    if ((run.status === "queued" || run.status === "running") && current.errorCode === "bad_input") {
      projected.claim = "bad_input";
    }
    return persistProjection(input, projected);
  }
  return current.id === run.id ? { ...run, ...current } : run;
}

async function failOpen(
  input: PresenceRequest,
  run: PresenceRun,
  errorCode: string,
  errorMessage: string,
  reservation: SpendReservation | null,
  now: Date,
) {
  const failed: PresenceRun = {
    ...run,
    status: "failed",
    errorCode,
    errorMessage,
    finishedAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  const projected = projectRun(failed, now, input.config);
  projected.claim = errorCode === "bad_input" ? "bad_input" : "start_failed";
  if (reservation && reservation.deltaCents > 0 && projected.costDeltaCents === 0 && projected.run.costSource === "estimate") {
    projected.run = { ...projected.run, reservedCents: 0, costSource: "released" };
    projected.costDeltaCents = -reservation.deltaCents;
  }
  return persistProjection(input, projected);
}

async function refreshRun(input: PresenceRequest, run: PresenceRun, now: Date, readResult: boolean) {
  let current = run;
  if (readResult && (run.status === "queued" || run.status === "running" || run.status === "needs_review")) {
    const raw = await input.store.readObject(resultObjectKey(run)).catch((error) => {
      console.error("Could not read presence result.json.", error);
      return null;
    });
    current = overlayWorkerResult(run, raw);
  }
  const projected = projectRun(current, now, input.config);
  if (projected.costDeltaCents === 0 && projected.claim === null && sameObserved(run, projected.run)) {
    await releaseLockIfFinished(input, projected.run);
    return projected.run;
  }
  return persistProjection(input, projected);
}

async function persistProjection(input: PresenceRequest, projected: Projection) {
  const reservation = spendReservation(projected, input.config.capCents);
  try {
    await input.store.saveRun(projected.run, reservation, projected.claim);
    await releaseLockIfFinished(input, projected.run);
    return projected.run;
  } catch (error) {
    if (projected.claim && asHttpError(error)?.statusCode === 409) {
      const fresh = await input.store.getRun(projected.run.id);
      if (!fresh) throw error;
      const again = projectRun(fresh, new Date(projected.run.updatedAt), input.config);
      again.claim = null;
      const againReservation = spendReservation(again, input.config.capCents);
      if (again.costDeltaCents !== 0) {
        await input.store.saveRun(again.run, againReservation, null);
      }
      await releaseLockIfFinished(input, again.run);
      return again.run;
    }
    throw error;
  }
}

async function settleStaleRuns(input: PresenceRequest, now: Date) {
  for (const run of await input.store.listRuns()) {
    if (run.status !== "queued" && run.status !== "running") continue;
    const started = Date.parse(run.startedAt || run.createdAt);
    if (Number.isFinite(started) && now.getTime() - started > RUN_TIMEOUT_MS) {
      await refreshRun(input, run, now, true);
    }
  }
}

async function runInProgress(input: PresenceRequest, now: Date) {
  const runs = await input.store.listRuns();
  return runs.some((run) => isBlocking(run, now));
}

function isBlocking(run: PresenceRun, now: Date) {
  if (run.status !== "queued" && run.status !== "running") return false;
  const started = Date.parse(run.startedAt || run.createdAt);
  return !Number.isFinite(started) || now.getTime() - started <= RUN_TIMEOUT_MS;
}

async function releaseLockForFinishedHolder(input: PresenceRequest, now: Date) {
  const held = await input.store.getRunLock();
  if (!held?.holder) return;
  const holder = await input.store.getRun(held.holder);
  if (!holder) return;
  if (isTerminal(holder.status)) {
    await refreshRun(input, holder, now, true);
    return;
  }
  const started = Date.parse(holder.startedAt || holder.createdAt);
  const open = holder.status === "queued" || holder.status === "running";
  if (open && Number.isFinite(started) && now.getTime() - started > RUN_TIMEOUT_MS) {
    await refreshRun(input, holder, now, true);
  }
}

async function releaseLockIfFinished(input: PresenceRequest, run: PresenceRun) {
  if (isTerminal(run.status)) await input.store.releaseRunLock(run.id);
}

async function requireRun(input: PresenceRequest, id: string) {
  const run = await input.store.getRun(id);
  if (!run || run.id !== id) throw new PresenceError(404, "Report not found.");
  return run;
}

function assertWorker(config: PresenceConfig) {
  if (!config.workerConfigured || !config.bucket) {
    throw new PresenceError(
      503,
      "The worker is not deployed on this stack yet. Set FIRST_LIGHT_AUDIT_WORKER_IMAGE_TAG and deploy before starting a report.",
    );
  }
}

function assertRealAllowed(config: PresenceConfig, testMode: boolean) {
  if (!testMode && !config.realRunsEnabled) {
    throw new PresenceError(
      409,
      "Real runs are switched off. Leave the free test run on. FIRST_LIGHT_AUDIT_WORKER_ALLOW_REAL=true is required before a run can call Apify or AI.",
    );
  }
}

interface ParsedRun {
  company: string;
  website: string;
  handles: PresenceHandles;
  business: string;
  area: string;
  businessId: string;
  testMode: boolean;
  compareToRunId?: string;
}

function parseRunInput(rawBody: string | undefined, config: PresenceConfig): ParsedRun {
  const body = parseJson(rawBody);
  for (const key of Object.keys(body)) {
    if (!REQUEST_KEYS.has(key)) throw new PresenceError(422, `Unknown field ${key}.`);
  }
  const company = requiredCompany(body.company);
  const website = checkWebsite(body.website);
  const handles = parseHandles(body.handles);
  const business = body.business === undefined || body.business === null || body.business === "" ? "" : requiredBounded(body.business, "Legal name", 200);
  const area = body.area === undefined || body.area === null || body.area === "" ? "" : requiredBounded(body.area, "Area", 60);
  const testMode =
    body.testMode === undefined && body.test_mode === undefined
      ? config.defaultTestMode
      : requiredBoolean(body.testMode ?? body.test_mode, "Free test run");
  const compareRaw = body.compareToRunId ?? body.compare_to_run_id;
  const compareToRunId = compareRaw === undefined || compareRaw === null || compareRaw === "" ? undefined : requiredUlid(compareRaw);
  const businessRaw = body.businessId ?? body.business_id;
  const businessId =
    businessRaw === undefined || businessRaw === null || businessRaw === ""
      ? slugifyBusinessId(company)
      : requiredSlug(businessRaw);
  return { company, website, handles, business, area, businessId, testMode, compareToRunId };
}

function requestFromRun(run: PresenceRun): ParsedRun {
  return {
    company: run.company,
    website: run.website,
    handles: run.handles,
    business: run.business,
    area: run.area,
    businessId: run.businessId,
    testMode: run.testMode,
    compareToRunId: run.id,
  };
}

function parseHandles(value: unknown): PresenceHandles {
  if (value === undefined || value === null) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new PresenceError(422, "handles must be an object");
  rejectUnknown(value as Record<string, unknown>, new Set(["instagram", "tiktok", "facebook"]), "handles");
  const source = value as Record<string, unknown>;
  const handles: PresenceHandles = {};
  for (const key of ["instagram", "tiktok"] as const) {
    const raw = source[key];
    if (raw === undefined || raw === null || raw === "") continue;
    if (typeof raw !== "string") throw new PresenceError(422, `handles.${key} must be ${HANDLE_RULES[key].what}`);
    const handle = raw.trim().replace(/^@/, "");
    if (!HANDLE_RULES[key].pattern.test(handle)) throw new PresenceError(422, `handles.${key} must be ${HANDLE_RULES[key].what}`);
    handles[key] = handle;
  }
  const facebook = readFacebookHandle(source.facebook);
  if (facebook) handles.facebook = facebook;
  return handles;
}

function readFacebookHandle(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !value.trim() || value.length > 200) {
    fail("handles.facebook must be a Facebook Page name or address");
  }
  const handle = value.trim();
  if (FACEBOOK_DISALLOWED.test(value) || FACEBOOK_DISALLOWED.test(handle)) fail(FACEBOOK_WHITESPACE);
  return handle;
}

/** Spaces and zero-width characters. Keep in sync with FACEBOOK_DISALLOWED in src/lib/presenceReport.ts. */
const FACEBOOK_DISALLOWED = /[\s\u200b-\u200d\u2060\u180e\ufeff]/;

function spendReservation(projected: Projection, capCents: number): SpendReservation | null {
  if (projected.costDeltaCents === 0) return null;
  const mode: SpendReservation["mode"] = projected.costDeltaCents < 0 ? "release" : "reconcile";
  // No cap means the month counter was never created. Recording cost_usd stays on the run row.
  if (mode === "reconcile" && capCents <= 0) return null;
  return { month: projected.run.month, deltaCents: projected.costDeltaCents, mode, capCents };
}

function checkWebsite(value: unknown) {
  if (typeof value !== "string" || !value.trim()) fail("website is required");
  if (value.length > 300) fail("website must be an https:// address without a username or password");
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    fail("website must be an https:// address without a username or password");
  }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (url.protocol !== "https:" || !host || url.username || url.password) {
    fail("website must be an https:// address without a username or password");
  }
  if (url.port && url.port !== "443") fail("website must use the standard https port");
  // Any IP literal is rejected. That includes loopback, private ranges, and link-local 169.254.0.0/16.
  if (isIpAddress(host) || host === "localhost" || host.endsWith(".localhost") || !host.includes(".")) {
    fail("website must be a public domain name, not an IP address or internal host");
  }
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    fail("website must be a public domain name, not an IP address or internal host");
  }
  return value.trim();
}

function isIpAddress(host: string) {
  if (host.includes(":")) return true;
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
}

function checkOptions(options: Record<string, unknown>) {
  optionalNumber(options, "max_posts", 12, 60, "options", true);
  optionalBool(options, "require_social", "options", false);
  optionalBool(options, "force_fresh", "options", false);
  optionalString(options, "business", 200, "options");
  const competitors = nested(options, "competitors", [
    "enabled",
    "queries",
    "service",
    "area",
    "radius_km",
    "max",
    "socials",
    "pagespeed",
  ]);
  const queries = competitors.queries;
  if (
    queries !== undefined &&
    queries !== null &&
    (!Array.isArray(queries) ||
      queries.length > 3 ||
      !queries.every((item) => typeof item === "string" && item.trim() && item.length <= 80))
  ) {
    fail("options.competitors.queries must be up to 3 short strings");
  }
  optionalString(competitors, "service", 60, "options.competitors");
  optionalString(competitors, "area", 60, "options.competitors");
  optionalNumber(competitors, "radius_km", 1, 50, "options.competitors", false);
  optionalNumber(competitors, "max", 0, 5, "options.competitors", true);
  const reviews = nested(options, "reviews", ["details", "max_reviews"]);
  optionalNumber(reviews, "max_reviews", 0, 200, "options.reviews", true);
  const ai = nested(options, "ai", ["enabled", "crawlers", "runs", "prompts"]);
  const prompts = ai.prompts;
  if (
    prompts !== undefined &&
    prompts !== null &&
    (!Array.isArray(prompts) ||
      prompts.length > 2 ||
      !prompts.every((item) => typeof item === "string" && item.trim() && item.length <= 140))
  ) {
    fail("options.ai.prompts must be up to 2 short strings");
  }
  optionalNumber(ai, "runs", 1, 3, "options.ai", true);
  const budget = nested(options, "budget_usd", ["reviews", "competitors", "ai"]);
  optionalNumber(budget, "reviews", 0, 0.3, "options.budget_usd", false);
  optionalNumber(budget, "competitors", 0, 1, "options.budget_usd", false);
  optionalNumber(budget, "ai", 0, 0.2, "options.budget_usd", false);
}

function normalOptions(options: Record<string, unknown>, compareTo: string | null) {
  const competitors = (options.competitors || {}) as Record<string, unknown>;
  const reviews = (options.reviews || {}) as Record<string, unknown>;
  const ai = (options.ai || {}) as Record<string, unknown>;
  const budget = (options.budget_usd || {}) as Record<string, unknown>;
  return {
    business: optionalString(options, "business", 200, "options"),
    no_social: Boolean(optionalBool(options, "no_social", "options", false)),
    max_posts: optionalNumber(options, "max_posts", 12, 60, "options", true),
    require_social: Boolean(optionalBool(options, "require_social", "options", false)),
    force_fresh: Boolean(optionalBool(options, "force_fresh", "options", false)),
    compare_to_run_id: compareTo,
    competitors: {
      enabled: optionalBool(competitors, "enabled", "options.competitors", true),
      queries: Array.isArray(competitors.queries) ? (competitors.queries as string[]).map((item) => item.trim()) : [],
      service: optionalString(competitors, "service", 60, "options.competitors"),
      area: optionalString(competitors, "area", 60, "options.competitors"),
      radius_km: optionalNumber(competitors, "radius_km", 1, 50, "options.competitors", false),
      max: optionalNumber(competitors, "max", 0, 5, "options.competitors", true),
      socials: optionalBool(competitors, "socials", "options.competitors", true),
      pagespeed: optionalBool(competitors, "pagespeed", "options.competitors", true),
    },
    reviews: {
      details: optionalBool(reviews, "details", "options.reviews", true),
      max_reviews: optionalNumber(reviews, "max_reviews", 0, 200, "options.reviews", true),
    },
    ai: {
      enabled: optionalBool(ai, "enabled", "options.ai", true),
      crawlers: optionalBool(ai, "crawlers", "options.ai", true),
      runs: optionalNumber(ai, "runs", 1, 3, "options.ai", true),
      prompts: Array.isArray(ai.prompts) ? (ai.prompts as string[]).map((item) => item.trim()) : [],
    },
    budget_usd: {
      reviews: optionalNumber(budget, "reviews", 0, 0.3, "options.budget_usd", false),
      competitors: optionalNumber(budget, "competitors", 0, 1, "options.budget_usd", false),
      ai: optionalNumber(budget, "ai", 0, 0.2, "options.budget_usd", false),
    },
  };
}

function nested(obj: Record<string, unknown>, key: string, allowed: string[]) {
  const value = obj[key];
  if (value === undefined || value === null) return {} as Record<string, unknown>;
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`options.${key} must be an object`);
  rejectUnknown(value as Record<string, unknown>, new Set(allowed), `options.${key}`);
  return value as Record<string, unknown>;
}

function optionalString(obj: Record<string, unknown>, key: string, max: number, where: string) {
  if (!(key in obj) || obj[key] === null) return null;
  const value = obj[key];
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    fail(`${where}.${key} must be a non-empty string of at most ${max} characters`);
  }
  return value.trim();
}

function optionalBool(obj: Record<string, unknown>, key: string, where: string, fallback: boolean | null) {
  if (!(key in obj)) return fallback;
  const value = obj[key];
  if (value === null) return fallback;
  if (typeof value !== "boolean") fail(`${where}.${key} must be true or false`);
  return value;
}

function optionalNumber(obj: Record<string, unknown>, key: string, lo: number, hi: number, where: string, integer: boolean) {
  if (!(key in obj) || obj[key] === null || obj[key] === undefined) return null;
  const value = obj[key];
  const ok = integer ? typeof value === "number" && Number.isInteger(value) : typeof value === "number";
  if (!ok || typeof value !== "number" || value < lo || value > hi) {
    fail(`${where}.${key} must be ${integer ? "an integer" : "a number"} from ${lo} to ${hi}`);
  }
  return value;
}

function rejectUnknown(obj: Record<string, unknown>, allowed: Set<string>, where: string) {
  const extra = Object.keys(obj).filter((key) => !allowed.has(key)).sort();
  if (extra.length) fail(`${where}: unknown field(s) ${extra.join(", ")}`);
}

function fail(message: string): never {
  throw new PresenceError(422, message);
}

function requiredCompany(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 120) {
    throw new PresenceError(422, "company is required (at most 120 characters)");
  }
  return value.trim().split(/\s+/).join(" ");
}

function requiredBounded(value: unknown, label: string, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new PresenceError(422, `${label} must be a non-empty string of at most ${max} characters`);
  }
  return value.trim();
}

function requiredBoolean(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new PresenceError(422, `${label} must be true or false.`);
  return value;
}

function requiredUlid(value: unknown) {
  if (typeof value !== "string" || !ULID.test(value)) throw new PresenceError(422, "options.compare_to_run_id must be a 26-character ULID");
  return value;
}

function requiredSlug(value: unknown) {
  if (typeof value !== "string" || !SLUG.test(value)) {
    throw new PresenceError(422, "business_id must be 2 to 60 lowercase letters, digits or hyphens");
  }
  return value;
}

function parseJson(rawBody?: string) {
  try {
    const parsed = JSON.parse(rawBody || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new PresenceError(400, "Invalid JSON.");
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof PresenceError) throw error;
    throw new PresenceError(400, "Invalid JSON.");
  }
}

function spendSummary(config: PresenceConfig, month: string, monthCents: number): PresenceSpendSummary {
  return {
    month,
    monthToDateUsd: centsToUsd(monthCents),
    capUsd: config.capUsd,
    estimatePerRunUsd: config.estimateUsd,
    realRunsEnabled: config.realRunsEnabled,
    workerConfigured: config.workerConfigured,
    defaultTestMode: config.defaultTestMode,
  };
}

function capMessage(config: PresenceConfig, monthCents: number) {
  return (
    `This month's reports are at ${formatUsd(monthCents)} of the ${formatUsd(config.capCents)} cap. ` +
    `A real run is estimated at ${formatUsd(config.estimateCents)}, so it was not started. ` +
    "Free test runs are still available."
  );
}

function reserve(month: string, deltaCents: number, capCents: number): SpendReservation {
  return { month, deltaCents, mode: "reserve", capCents };
}

function knownStatus(value: unknown): PresenceStatus | undefined {
  if (value === "queued" || value === "running" || value === "succeeded" || value === "needs_review" || value === "failed" || value === "cancelled") {
    return value;
  }
  return undefined;
}

function knownCost(value: unknown): PresenceCostSource | undefined {
  if (value === "test" || value === "estimate" || value === "worker" || value === "released") return value;
  return undefined;
}

function isTerminal(status: PresenceStatus) {
  return status === "succeeded" || status === "needs_review" || status === "failed" || status === "cancelled";
}

function statusLabel(status: PresenceStatus, notTracked: boolean): PresenceStatusLabel {
  if (notTracked) return "Not tracked";
  if (status === "succeeded") return "Completed";
  if (status === "needs_review") return "Needs review";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  if (status === "running") return "Running";
  return "Queued";
}

function failureMessage(id: string) {
  return FAILURE_TEXT[id] || `Readiness check failed (${id}).`;
}

function safeDetail(value: string | undefined) {
  if (!value) return "";
  const textValue = value.replace(/\s+/g, " ").trim();
  if (!textValue || textValue.length > 300) return "";
  if (/secret|token|api[_-]?key/i.test(textValue)) return "";
  return textValue;
}

function costLabel(run: PresenceRun): PresenceCostLabel {
  if (run.testMode || run.costSource === "test") return "Free";
  if (run.costSource === "worker") return "Actual";
  if (run.costSource === "released") return "Released";
  return "Estimated";
}

function readCostUsd(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const total = (value as Record<string, unknown>).total;
  if (typeof total !== "number" || !Number.isFinite(total) || total < 0) return undefined;
  return total;
}

function pdfKeyFor(businessId: string, id: string, status: PresenceStatus, artifacts: unknown) {
  if (status !== "succeeded" && status !== "needs_review") return undefined;
  const expected = `runs/${businessId}/${id}/report.pdf`;
  const pdf =
    artifacts && typeof artifacts === "object" && !Array.isArray(artifacts)
      ? (artifacts as Record<string, unknown>).pdf
      : undefined;
  if (pdf !== undefined && pdf !== expected) return undefined;
  return expected;
}

function stringList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0 && item.length <= 80);
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function pdfFileName(company: string) {
  const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return `${slug || "presence"}-presence-audit.pdf`;
}

function safeDownloadName(fileName: string) {
  const safe = fileName.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(0, 120);
  return safe.toLowerCase().endsWith(".pdf") ? safe : `${safe || "presence-audit"}.pdf`;
}

function sameObserved(before: PresenceRun, after: PresenceRun) {
  return (
    before.status === after.status &&
    before.errorCode === after.errorCode &&
    before.reservedCents === after.reservedCents &&
    before.costSource === after.costSource &&
    before.costUsd === after.costUsd &&
    before.trackingStopped === after.trackingStopped &&
    before.finishedAt === after.finishedAt &&
    before.qualityFailures.join("|") === after.qualityFailures.join("|")
  );
}

function readDecimal(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) return fallback;
  return parsed;
}

function toCents(usd: number) {
  return Math.round(usd * 100);
}

function centsToUsd(cents: number) {
  return Math.round(cents) / 100;
}

function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(centsToUsd(cents));
}

function json(statusCode: number, body: unknown) {
  return { statusCode, body };
}

function asHttpError(error: unknown) {
  if (error instanceof PresenceError) return error;
  if (error && typeof error === "object" && "statusCode" in error && "message" in error) {
    const statusCode = (error as { statusCode: unknown }).statusCode;
    const message = (error as { message: unknown }).message;
    if (typeof statusCode === "number" && typeof message === "string") return { statusCode, message };
  }
  return null;
}

function normalizePath(path: string) {
  const withoutQuery = path.split("?")[0] || "/";
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) return withoutQuery.slice(0, -1);
  return withoutQuery;
}
