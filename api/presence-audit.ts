/**
 * Online presence audit runs.
 *
 * The worker image lives in Report-Generator-FLM. This module is the admin
 * contract we invoke it with: one JSON event, the same JSON at
 * `runs/{id}/input.json`, status at `runs/{id}/status.json`, and the PDF at
 * `runs/{id}/report.pdf`. Field names are sent in camelCase and snake_case.
 * See docs/AUDIT_REPORTS.md for the assumption and the deploy switches.
 */

export const PRESENCE_RUN_PREFIX = "PRESENCE_RUN#";
export const PRESENCE_SPEND_PK = "PRESENCE_SPEND";
export const PRESENCE_PAGE_LIMIT_MAX = 35;
export const DEFAULT_MONTHLY_CAP_GBP = 50;
export const DEFAULT_RUN_ESTIMATE_GBP = 5;

export const SOCIAL_KEYS = ["instagram", "facebook", "tiktok", "linkedin", "youtube", "x"] as const;
export type SocialKey = (typeof SOCIAL_KEYS)[number];
export type PresenceSocials = Record<SocialKey, string>;

export type PresenceStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type PresenceCostSource = "test" | "estimate" | "worker" | "released";
export type PresenceCostLabel = "Free" | "Estimated" | "Actual" | "Released";

export interface PresenceRun {
  id: string;
  businessName: string;
  website: string;
  socials: PresenceSocials;
  location: string;
  notes: string;
  testMode: boolean;
  pageLimit: number;
  status: PresenceStatus;
  progress: number;
  statusMessage: string;
  fileName: string;
  s3Prefix: string;
  pdfKey?: string;
  errorMessage?: string;
  reservedPence: number;
  costSource: PresenceCostSource;
  attempts: number;
  month: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface PresenceConfig {
  capGbp: number;
  capPence: number;
  estimateGbp: number;
  estimatePence: number;
  pageLimit: number;
  realRunsEnabled: boolean;
  defaultTestMode: boolean;
  workerConfigured: boolean;
  bucket: string;
  brandConfigPath: string;
}

export interface PresenceSpendSummary {
  month: string;
  monthToDateGbp: number;
  capGbp: number;
  estimatePerRunGbp: number;
  realRunsEnabled: boolean;
  workerConfigured: boolean;
  defaultTestMode: boolean;
  pageLimit: number;
}

export interface SpendReservation {
  month: string;
  deltaPence: number;
  mode: "reserve" | "release" | "reconcile";
  capPence: number;
}

export interface PresenceStore {
  listRuns(): Promise<PresenceRun[]>;
  getRun(id: string): Promise<PresenceRun | null>;
  monthSpendPence(month: string): Promise<number>;
  insertRun(run: PresenceRun, reservation: SpendReservation | null): Promise<void>;
  saveRun(run: PresenceRun, reservation: SpendReservation | null): Promise<void>;
  writeObject(key: string, body: unknown): Promise<void>;
  readObject(key: string): Promise<Record<string, unknown> | null>;
  pdfExists(key: string): Promise<boolean>;
  invoke(payload: unknown): Promise<void>;
  presign(key: string, downloadName: string): Promise<string>;
}

export interface PresenceRequest {
  method: string;
  path: string;
  body?: string;
  config: PresenceConfig;
  now?: Date;
  newId?: () => string;
  authorize: () => Promise<void>;
  store: PresenceStore;
}

export class PresenceError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "PresenceError";
    this.statusCode = statusCode;
  }
}

const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LIST_PATH = "/api/admin/presence/runs";
const DOWNLOAD_SECONDS = 300;

export function isPresenceAdminRoute(method: string, path: string) {
  void method;
  return path === LIST_PATH || path.startsWith(`${LIST_PATH}/`);
}

export function loadPresenceConfig(env: Record<string, string | undefined>): PresenceConfig {
  const capGbp = readDecimal(env.AUDIT_MONTHLY_CAP_GBP, DEFAULT_MONTHLY_CAP_GBP, 0, 100_000);
  const estimateGbp = readDecimal(env.AUDIT_RUN_COST_ESTIMATE_GBP, DEFAULT_RUN_ESTIMATE_GBP, 0.01, 100_000);
  const pageLimit = readInteger(env.AUDIT_PAGE_LIMIT, PRESENCE_PAGE_LIMIT_MAX, 1, PRESENCE_PAGE_LIMIT_MAX);
  return {
    capGbp,
    capPence: toPence(capGbp),
    estimateGbp,
    estimatePence: toPence(estimateGbp),
    pageLimit,
    realRunsEnabled: env.AUDIT_REAL_RUNS_ENABLED === "true",
    defaultTestMode: env.PRESENCE_DEFAULT_TEST_MODE !== "false",
    workerConfigured: Boolean(env.AUDIT_WORKER_FUNCTION_NAME?.trim()),
    bucket: env.AUDIT_REPORTS_BUCKET_NAME?.trim() || "",
    brandConfigPath: safeBrandPath(env.AUDIT_BRAND_CONFIG_PATH),
  };
}

export function monthKey(date: Date) {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
}

export function capBlocks(monthPence: number, reservePence: number, capPence: number) {
  if (reservePence <= 0) return false;
  return monthPence + reservePence > capPence;
}

export function runPrefix(id: string) {
  return `runs/${id}/`;
}

export function applyWorkerStatus(
  run: PresenceRun,
  raw: Record<string, unknown> | null,
  now: string,
  estimatePence: number,
): { run: PresenceRun; costDeltaPence: number } {
  if (!raw) return { run, costDeltaPence: 0 };

  let status = readStatus(raw.status) || run.status;
  if (run.status === "cancelled" && status !== "completed") status = "cancelled";

  const reportedProgress = readProgress(raw.progress ?? raw.progress_percent ?? raw.progressPercent);
  const progress = status === "completed" ? 100 : reportedProgress ?? run.progress;
  const statusMessage =
    readText(raw.message ?? raw.status_message ?? raw.statusMessage ?? raw.detail) || run.statusMessage;
  let pdfKey = readPdfKey(run.id, raw.pdfKey ?? raw.pdf_key ?? raw.reportKey ?? raw.report_key);
  if (status === "completed" && !pdfKey) pdfKey = `${run.s3Prefix}report.pdf`;

  const errorMessage =
    status === "failed"
      ? readText(raw.error ?? raw.errorMessage ?? raw.error_message ?? raw.message) ||
        run.errorMessage ||
        "The audit failed."
      : status === "completed"
        ? undefined
        : run.errorMessage;

  let reservedPence = run.reservedPence;
  let costSource = run.costSource;
  let costDeltaPence = 0;
  const terminal = status === "completed" || status === "failed";
  if (!run.testMode && terminal && costSource !== "worker") {
    const reported = readReportedCost(raw);
    if (reported !== undefined) {
      const target = toPence(reported);
      costDeltaPence = target - reservedPence;
      reservedPence = target;
      costSource = "worker";
    } else if (costSource === "released" && reservedPence === 0 && estimatePence > 0) {
      costDeltaPence = estimatePence;
      reservedPence = estimatePence;
      costSource = "estimate";
    }
  }

  const next: PresenceRun = {
    ...run,
    status,
    progress,
    statusMessage,
    pdfKey: pdfKey || undefined,
    errorMessage,
    reservedPence,
    costSource: run.testMode ? "test" : costSource,
    updatedAt: now,
    completedAt: status === "completed" ? run.completedAt || now : run.completedAt,
  };

  if (costDeltaPence === 0 && sameRun(run, next)) return { run, costDeltaPence: 0 };
  return { run: next, costDeltaPence };
}

export async function handlePresenceRequest(input: PresenceRequest): Promise<{ statusCode: number; body: unknown }> {
  try {
    await input.authorize();
    const action = matchAction(input.method, normalizePath(input.path));
    if (!action) return json(404, { error: "Not found" });

    const now = input.now ?? new Date();
    switch (action.kind) {
      case "list":
        return await listRuns(input, now);
      case "create":
        return await createRun(input, now);
      case "get":
        return await getRun(input, action.id, now);
      case "download":
        return await downloadRun(input, action.id, now);
      case "cancel":
        return await cancelRun(input, action.id, now);
      case "retry":
        return await retryRun(input, action.id, now);
      default:
        return json(404, { error: "Not found" });
    }
  } catch (error) {
    const http = asHttpError(error);
    if (http) return json(http.statusCode, { error: http.message });
    throw error;
  }
}

export function publicRun(run: PresenceRun) {
  return {
    id: run.id,
    businessName: run.businessName,
    website: run.website,
    socials: run.socials,
    location: run.location,
    notes: run.notes,
    testMode: run.testMode,
    pageLimit: run.pageLimit,
    status: run.status,
    progress: run.progress,
    statusMessage: run.statusMessage,
    fileName: run.fileName,
    errorMessage: run.errorMessage,
    estimatedCostGbp: run.testMode ? 0 : penceToGbp(run.reservedPence),
    costLabel: costLabel(run),
    attempts: run.attempts,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt,
    downloadReady: run.status === "completed" && Boolean(run.pdfKey && isRunPdfKey(run.id, run.pdfKey)),
  };
}

export function workerPayload(run: PresenceRun, config: PresenceConfig) {
  const prefix = run.s3Prefix;
  return {
    schemaVersion: 1,
    runId: run.id,
    run_id: run.id,
    businessName: run.businessName,
    business_name: run.businessName,
    website: run.website,
    socials: run.socials,
    location: run.location,
    notes: run.notes,
    testMode: run.testMode,
    test_mode: run.testMode,
    pageLimit: run.pageLimit,
    page_limit: run.pageLimit,
    bucket: config.bucket,
    runsPrefix: "runs",
    s3Prefix: prefix,
    brandConfigPath: config.brandConfigPath,
    brand_config_path: config.brandConfigPath,
    output: {
      bucket: config.bucket,
      prefix,
      inputKey: `${prefix}input.json`,
      statusKey: `${prefix}status.json`,
      pdfKey: `${prefix}report.pdf`,
      cancelKey: `${prefix}cancel.json`,
    },
  };
}

function matchAction(method: string, path: string) {
  if (path === LIST_PATH && method === "GET") return { kind: "list" as const };
  if (path === LIST_PATH && method === "POST") return { kind: "create" as const };

  const parts = path.split("/").filter(Boolean);
  // api / admin / presence / runs / :id / [action]
  if (parts.length < 5 || parts[0] !== "api" || parts[1] !== "admin" || parts[2] !== "presence" || parts[3] !== "runs") {
    return null;
  }
  const id = parts[4].toLowerCase();
  if (!RUN_ID.test(id)) return null;
  if (parts.length === 5 && method === "GET") return { kind: "get" as const, id };
  if (parts.length === 6 && method === "POST" && parts[5] === "download") return { kind: "download" as const, id };
  if (parts.length === 6 && method === "POST" && parts[5] === "cancel") return { kind: "cancel" as const, id };
  if (parts.length === 6 && method === "POST" && parts[5] === "retry") return { kind: "retry" as const, id };
  return null;
}

async function listRuns(input: PresenceRequest, now: Date) {
  const runs = (await input.store.listRuns()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  let refreshed = 0;
  const next: PresenceRun[] = [];
  for (const run of runs) {
    if ((run.status === "queued" || run.status === "running") && refreshed < 15) {
      refreshed += 1;
      next.push(await refreshRun(input, run, now));
    } else {
      next.push(run);
    }
  }
  const month = monthKey(now);
  const spent = await input.store.monthSpendPence(month);
  return json(200, { runs: next.map(publicRun), spend: spendSummary(input.config, month, spent) });
}

async function getRun(input: PresenceRequest, id: string, now: Date) {
  const run = await requireRun(input, id);
  const refreshed = await refreshRun(input, run, now);
  const spent = await input.store.monthSpendPence(monthKey(now));
  return json(200, { run: publicRun(refreshed), spend: spendSummary(input.config, monthKey(now), spent) });
}

async function createRun(input: PresenceRequest, now: Date) {
  assertWorker(input.config);
  const requested = parseRunInput(input.body, input.config);
  assertRealAllowed(input.config, requested.testMode);

  const stamp = now.toISOString();
  const month = monthKey(now);
  const id = (input.newId ?? randomId)();
  if (!RUN_ID.test(id)) throw new PresenceError(500, "Could not allocate a run id.");

  const reservePence = requested.testMode ? 0 : input.config.estimatePence;
  const spent = await input.store.monthSpendPence(month);
  if (capBlocks(spent, reservePence, input.config.capPence)) {
    throw new PresenceError(409, capMessage(input.config, spent));
  }

  const run: PresenceRun = {
    id,
    businessName: requested.businessName,
    website: requested.website,
    socials: requested.socials,
    location: requested.location,
    notes: requested.notes,
    testMode: requested.testMode,
    pageLimit: requested.pageLimit,
    status: "queued",
    progress: 0,
    statusMessage: requested.testMode ? "Queued free test run." : "Queued real run.",
    fileName: pdfFileName(requested.businessName),
    s3Prefix: runPrefix(id),
    reservedPence: reservePence,
    costSource: requested.testMode ? "test" : "estimate",
    attempts: 1,
    month,
    createdAt: stamp,
    updatedAt: stamp,
  };

  const reservation = reservePence > 0 ? reserve(month, reservePence, input.config.capPence) : null;
  try {
    await input.store.insertRun(run, reservation);
  } catch (error) {
    if (asHttpError(error)?.statusCode === 409) throw new PresenceError(409, capMessage(input.config, spent));
    throw error;
  }

  const started = await dispatch(input, run, reservation);
  const latestSpend = await input.store.monthSpendPence(month);
  return json(200, { run: publicRun(started), spend: spendSummary(input.config, month, latestSpend) });
}

async function downloadRun(input: PresenceRequest, id: string, now: Date) {
  const run = await refreshRun(input, await requireRun(input, id), now);
  if (run.status !== "completed" || !run.pdfKey || !isRunPdfKey(run.id, run.pdfKey)) {
    throw new PresenceError(409, "The audit report is not ready to download yet.");
  }
  if (!(await input.store.pdfExists(run.pdfKey))) {
    throw new PresenceError(409, "The audit report is not ready to download yet.");
  }
  const downloadUrl = await input.store.presign(run.pdfKey, safeDownloadName(run.fileName));
  return json(200, { downloadUrl, expiresIn: DOWNLOAD_SECONDS });
}

async function cancelRun(input: PresenceRequest, id: string, now: Date) {
  const current = await refreshRun(input, await requireRun(input, id), now);
  if (current.status === "completed" || current.status === "failed") {
    throw new PresenceError(409, "This run has already finished.");
  }
  if (current.status === "cancelled") {
    const spent = await input.store.monthSpendPence(monthKey(now));
    return json(200, { run: publicRun(current), spend: spendSummary(input.config, monthKey(now), spent) });
  }

  const stamp = now.toISOString();
  const releaseReservation =
    current.status === "queued" && current.reservedPence > 0
      ? release(current.month, current.reservedPence, input.config.capPence)
      : null;
  const next: PresenceRun = {
    ...current,
    status: "cancelled",
    statusMessage: current.status === "queued" ? "Cancelled before the worker started." : "Cancel requested.",
    reservedPence: releaseReservation ? 0 : current.reservedPence,
    costSource: releaseReservation ? "released" : current.costSource,
    errorMessage: undefined,
    updatedAt: stamp,
  };

  await input.store.writeObject(`${current.s3Prefix}cancel.json`, { cancel: true, at: stamp, runId: current.id });
  await input.store.saveRun(next, releaseReservation);
  const spent = await input.store.monthSpendPence(current.month);
  return json(200, { run: publicRun(next), spend: spendSummary(input.config, current.month, spent) });
}

async function retryRun(input: PresenceRequest, id: string, now: Date) {
  assertWorker(input.config);
  const current = await refreshRun(input, await requireRun(input, id), now);
  if (current.status !== "failed" && current.status !== "cancelled") {
    throw new PresenceError(409, "Only a failed or cancelled run can be retried.");
  }
  assertRealAllowed(input.config, current.testMode);

  const month = monthKey(now);
  const reservePence = current.testMode ? 0 : input.config.estimatePence;
  const spent = await input.store.monthSpendPence(month);
  if (capBlocks(spent, reservePence, input.config.capPence)) {
    throw new PresenceError(409, capMessage(input.config, spent));
  }

  const stamp = now.toISOString();
  const sameMonth = current.month === month;
  const next: PresenceRun = {
    ...current,
    status: "queued",
    progress: 0,
    statusMessage: `Queued retry ${current.attempts + 1}.`,
    errorMessage: undefined,
    completedAt: undefined,
    pdfKey: undefined,
    // Previous months keep their own counter. This run shows what the current month is holding.
    reservedPence: current.testMode ? 0 : sameMonth ? current.reservedPence + reservePence : reservePence,
    costSource: current.testMode ? "test" : "estimate",
    attempts: current.attempts + 1,
    month,
    updatedAt: stamp,
  };
  const reservation = reservePence > 0 ? reserve(month, reservePence, input.config.capPence) : null;
  try {
    await input.store.saveRun(next, reservation);
  } catch (error) {
    if (asHttpError(error)?.statusCode === 409) throw new PresenceError(409, capMessage(input.config, spent));
    throw error;
  }

  const started = await dispatch(input, next, reservation);
  const latestSpend = await input.store.monthSpendPence(month);
  return json(200, { run: publicRun(started), spend: spendSummary(input.config, month, latestSpend) });
}

async function dispatch(input: PresenceRequest, run: PresenceRun, reservation: SpendReservation | null) {
  const payload = workerPayload(run, input.config);
  try {
    await input.store.writeObject(`${run.s3Prefix}input.json`, payload);
    await input.store.invoke(payload);
    return run;
  } catch (error) {
    if (asHttpError(error)?.statusCode === 503) throw error;
    console.error("Presence worker invoke failed.");
    const failed = failedStart(run);
    const undo =
      reservation && reservation.deltaPence > 0
        ? release(run.month, reservation.deltaPence, input.config.capPence)
        : null;
    if (reservation && reservation.deltaPence > 0) {
      failed.reservedPence = Math.max(0, run.reservedPence - reservation.deltaPence);
      failed.costSource = failed.reservedPence === 0 ? "released" : run.costSource;
    }
    await input.store.saveRun(failed, undo);
    throw new PresenceError(502, "The audit worker could not be started.");
  }
}

function failedStart(run: PresenceRun): PresenceRun {
  return {
    ...run,
    status: "failed",
    statusMessage: "The worker did not start.",
    errorMessage: "The audit worker could not be started.",
    updatedAt: new Date().toISOString(),
  };
}

async function refreshRun(input: PresenceRequest, run: PresenceRun, now: Date) {
  if (run.status === "completed" || run.status === "failed") return run;

  const statusKey = `${run.s3Prefix}status.json`;
  const pdfKey = run.pdfKey && isRunPdfKey(run.id, run.pdfKey) ? run.pdfKey : `${run.s3Prefix}report.pdf`;
  let raw = await input.store.readObject(statusKey).catch((error) => {
    console.error("Could not read presence status.", error);
    return null;
  });
  const pdfReady = await input.store.pdfExists(pdfKey).catch(() => false);
  if (pdfReady) {
    raw = { ...(raw || {}), status: "completed", pdfKey };
  }

  const applied = applyWorkerStatus(run, raw, now.toISOString(), input.config.estimatePence);
  if (applied.costDeltaPence === 0 && applied.run === run) return run;

  const reservation =
    applied.costDeltaPence !== 0
      ? {
          month: applied.run.month,
          deltaPence: applied.costDeltaPence,
          mode: "reconcile" as const,
          capPence: input.config.capPence,
        }
      : null;
  await input.store.saveRun(applied.run, reservation);
  return applied.run;
}

async function requireRun(input: PresenceRequest, id: string) {
  const run = await input.store.getRun(id);
  if (!run || run.id !== id) throw new PresenceError(404, "Audit run not found.");
  return run;
}

function assertWorker(config: PresenceConfig) {
  if (!config.workerConfigured || !config.bucket) {
    throw new PresenceError(
      503,
      "The audit worker is not deployed on this stack yet. Set FIRST_LIGHT_AUDIT_WORKER_IMAGE_TAG and deploy before starting a run.",
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

function parseRunInput(rawBody: string | undefined, config: PresenceConfig) {
  const body = parseJson(rawBody);
  const businessName = requiredText(body.businessName ?? body.business_name, "Business name", 120);
  const website = requiredHttpsUrl(body.website, "Website");
  const socials = parseSocials(body.socials);
  const location = optionalText(body.location, "Location", 120);
  const notes = optionalText(body.notes, "Notes", 2000);
  const testMode = body.testMode === undefined && body.test_mode === undefined
    ? config.defaultTestMode
    : requiredBoolean(body.testMode ?? body.test_mode, "Free test run");
  const pageLimit = body.pageLimit === undefined && body.page_limit === undefined
    ? config.pageLimit
    : requiredPageLimit(body.pageLimit ?? body.page_limit, config.pageLimit);

  return { businessName, website, socials, location, notes, testMode, pageLimit };
}

function parseSocials(value: unknown): PresenceSocials {
  const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const socials = {} as PresenceSocials;
  for (const key of SOCIAL_KEYS) {
    socials[key] = optionalSocial(source[key], socialLabel(key));
  }
  return socials;
}

function optionalSocial(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value !== "string") throw new PresenceError(422, `${label} must be text.`);
  const text = value.trim();
  if (!text) return "";
  if (text.length > 300) throw new PresenceError(422, `${label} is too long.`);
  if (/[\u0000-\u001f]/.test(text)) throw new PresenceError(422, `${label} must be a handle or an https URL.`);
  if (text.includes("://") || text.startsWith("http:") || text.startsWith("https:")) {
    return requiredHttpsUrl(text, label);
  }
  if (!/^@?[A-Za-z0-9._/-]+$/.test(text) || text.includes("..")) {
    throw new PresenceError(422, `${label} must be a handle or an https URL.`);
  }
  return text;
}

function requiredHttpsUrl(value: unknown, label: string) {
  const text = requiredText(value, label, 300);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new PresenceError(422, `${label} must be an https URL.`);
  }
  if (url.protocol !== "https:" || !url.hostname) {
    throw new PresenceError(422, `${label} must be an https URL.`);
  }
  if (url.username || url.password) {
    throw new PresenceError(422, `${label} must not include a username or password.`);
  }
  return url.toString();
}

function requiredPageLimit(value: unknown, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max) {
    throw new PresenceError(422, `Page limit must be a whole number from 1 to ${max}.`);
  }
  return value;
}

function requiredBoolean(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new PresenceError(422, `${label} must be true or false.`);
  return value;
}

function requiredText(value: unknown, label: string, max: number) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PresenceError(422, `${label} is required.`);
  }
  const text = value.trim();
  if (text.length > max || /[\u0000-\u001f]/.test(text)) {
    throw new PresenceError(422, `${label} is too long.`);
  }
  return text;
}

function optionalText(value: unknown, label: string, max: number) {
  if (value === undefined || value === null || value === "") return "";
  return requiredText(value, label, max);
}

function parseJson(rawBody?: string) {
  try {
    const parsed = JSON.parse(rawBody || "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new PresenceError(400, "Invalid JSON.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof PresenceError) throw error;
    throw new PresenceError(400, "Invalid JSON.");
  }
}

function spendSummary(config: PresenceConfig, month: string, monthPence: number): PresenceSpendSummary {
  return {
    month,
    monthToDateGbp: penceToGbp(monthPence),
    capGbp: config.capGbp,
    estimatePerRunGbp: config.estimateGbp,
    realRunsEnabled: config.realRunsEnabled,
    workerConfigured: config.workerConfigured,
    defaultTestMode: config.defaultTestMode,
    pageLimit: config.pageLimit,
  };
}

function capMessage(config: PresenceConfig, monthPence: number) {
  return (
    `This month's presence audits are at ${formatGbp(monthPence)} of the ${formatGbp(config.capPence)} cap. ` +
    `A real run is estimated at ${formatGbp(config.estimatePence)}, so it was not started. ` +
    "Free test runs are still available."
  );
}

function reserve(month: string, deltaPence: number, capPence: number): SpendReservation {
  return { month, deltaPence, mode: "reserve", capPence };
}

function release(month: string, amountPence: number, capPence: number): SpendReservation {
  return { month, deltaPence: -amountPence, mode: "release", capPence };
}

function costLabel(run: PresenceRun): PresenceCostLabel {
  if (run.testMode) return "Free";
  if (run.costSource === "worker") return "Actual";
  if (run.costSource === "released") return "Released";
  return "Estimated";
}

function pdfFileName(businessName: string) {
  const slug = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${slug || "presence"}-presence-audit.pdf`;
}

function safeDownloadName(fileName: string) {
  const safe = fileName.replace(/[^\w.-]+/g, "_").replace(/_+/g, "_").slice(0, 120);
  return safe.toLowerCase().endsWith(".pdf") ? safe : `${safe || "presence-audit"}.pdf`;
}

function isRunPdfKey(id: string, key: string) {
  const prefix = runPrefix(id);
  return key.startsWith(prefix) && key.endsWith(".pdf") && !key.includes("..") && !key.includes("\\");
}

function readStatus(value: unknown): PresenceStatus | undefined {
  if (typeof value !== "string") return undefined;
  const normalised = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const table: Record<string, PresenceStatus> = {
    queued: "queued",
    pending: "queued",
    created: "queued",
    running: "running",
    in_progress: "running",
    processing: "running",
    started: "running",
    completed: "completed",
    complete: "completed",
    succeeded: "completed",
    success: "completed",
    done: "completed",
    failed: "failed",
    error: "failed",
    failure: "failed",
    cancelled: "cancelled",
    canceled: "cancelled",
  };
  return table[normalised];
}

function readProgress(value: unknown) {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function readReportedCost(raw: Record<string, unknown>) {
  const actual = firstMoney(raw, ["costGbp", "cost_gbp", "actualCostGbp", "actual_cost_gbp"]);
  if (actual !== undefined) return actual;
  const estimated = firstMoney(raw, ["estimatedCostGbp", "estimated_cost_gbp"]);
  if (estimated !== undefined) return estimated;
  const nested = raw.cost;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return firstMoney(nested as Record<string, unknown>, ["gbp", "amount_gbp", "amountGbp", "amount"]);
  }
  return undefined;
}

function firstMoney(raw: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const money = readMoney(raw[key]);
    if (money !== undefined) return money;
  }
  return undefined;
}

function readMoney(value: unknown) {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100_000) return undefined;
  return numeric;
}

function readPdfKey(id: string, value: unknown) {
  if (typeof value !== "string") return "";
  const key = value.trim();
  return isRunPdfKey(id, key) ? key : "";
}

function readText(value: unknown) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text) return "";
  return text.slice(0, 500);
}

function sameRun(left: PresenceRun, right: PresenceRun) {
  return (
    left.status === right.status &&
    left.progress === right.progress &&
    left.statusMessage === right.statusMessage &&
    left.pdfKey === right.pdfKey &&
    left.errorMessage === right.errorMessage &&
    left.reservedPence === right.reservedPence &&
    left.costSource === right.costSource &&
    left.completedAt === right.completedAt
  );
}

function socialLabel(key: SocialKey) {
  if (key === "x") return "X";
  return key.charAt(0).toUpperCase() + key.slice(1);
}

function readDecimal(raw: string | undefined, fallback: number, min: number, max: number) {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) return fallback;
  return value;
}

function readInteger(raw: string | undefined, fallback: number, min: number, max: number) {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) return fallback;
  return value;
}

function safeBrandPath(raw: string | undefined) {
  const value = raw?.trim() || "brand.json";
  if (value.length > 200 || value.includes("..") || /[\r\n]/.test(value)) return "brand.json";
  return value;
}

function toPence(gbp: number) {
  return Math.round(gbp * 100);
}

function penceToGbp(pence: number) {
  return Math.round(pence) / 100;
}

function formatGbp(pence: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(penceToGbp(pence));
}

function randomId() {
  return crypto.randomUUID();
}

function normalizePath(path: string) {
  const withoutTrailingSlash = path.replace(/\/$/, "");
  return withoutTrailingSlash || "/";
}

function json(statusCode: number, body: unknown) {
  return { statusCode, body };
}

function asHttpError(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  const message = (error as { message?: unknown }).message;
  if (typeof statusCode !== "number" || statusCode < 400 || statusCode > 599) return null;
  if (typeof message !== "string" || !message.trim()) return null;
  return { statusCode, message };
}
