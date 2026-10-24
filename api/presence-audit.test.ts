import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyWorkerStatus,
  capBlocks,
  handlePresenceRequest,
  loadPresenceConfig,
  monthKey,
  workerPayload,
  type PresenceConfig,
  type PresenceRun,
  type PresenceStore,
  type SpendReservation,
} from "./presence-audit.ts";

const NOW = new Date("2026-10-24T18:30:00.000Z");

describe("presence audit config", () => {
  it("defaults to a £50 cap, a £5 estimate, test mode, and no worker", () => {
    const config = loadPresenceConfig({});
    assert.equal(config.capGbp, 50);
    assert.equal(config.estimateGbp, 5);
    assert.equal(config.pageLimit, 35);
    assert.equal(config.realRunsEnabled, false);
    assert.equal(config.defaultTestMode, true);
    assert.equal(config.workerConfigured, false);
    assert.equal(config.brandConfigPath, "brand.json");
  });

  it("ignores malformed money and page limits and only enables real runs for the exact string true", () => {
    const config = loadPresenceConfig({
      AUDIT_MONTHLY_CAP_GBP: "nope",
      AUDIT_RUN_COST_ESTIMATE_GBP: "0",
      AUDIT_PAGE_LIMIT: "40",
      AUDIT_REAL_RUNS_ENABLED: "TRUE",
      PRESENCE_DEFAULT_TEST_MODE: "false",
      AUDIT_BRAND_CONFIG_PATH: "../secret.json",
      AUDIT_WORKER_FUNCTION_NAME: "audit-worker",
      AUDIT_REPORTS_BUCKET_NAME: "reports",
    });
    assert.equal(config.capGbp, 50);
    assert.equal(config.estimateGbp, 5);
    assert.equal(config.pageLimit, 35);
    assert.equal(config.realRunsEnabled, false);
    assert.equal(config.defaultTestMode, false);
    assert.equal(config.brandConfigPath, "brand.json");
    assert.equal(config.workerConfigured, true);
    assert.equal(config.bucket, "reports");
  });

  it("uses the UTC month", () => {
    assert.equal(monthKey(new Date("2026-10-31T23:30:00.000Z")), "2026-10");
    assert.equal(monthKey(new Date("2026-11-01T00:30:00.000Z")), "2026-11");
  });
});

describe("presence audit API", () => {
  it("requires auth before listing, creating, or cancelling", async () => {
    for (const request of [
      { method: "GET", path: "/api/admin/presence/runs" },
      { method: "POST", path: "/api/admin/presence/runs", body: JSON.stringify(validBody()) },
      { method: "POST", path: "/api/admin/presence/runs/11111111-1111-4111-8111-111111111111/cancel" },
    ]) {
      const store = memoryStore();
      const response = await handlePresenceRequest({
        ...request,
        config: testConfig(),
        now: NOW,
        authorize: async () => {
          throw http(401, "Please log in again.");
        },
        store,
      });
      assert.equal(response.statusCode, 401);
      assert.deepEqual(response.body, { error: "Please log in again." });
      assert.equal(store.inserts, 0);
      assert.equal(store.invocations.length, 0);
    }
  });

  it("rejects a run that is missing a business name, uses http, or asks for too many pages", async () => {
    const cases = [
      [{ ...validBody(), businessName: "  " }, "Business name is required."],
      [{ ...validBody(), website: "http://example.com" }, "Website must be an https URL."],
      [{ ...validBody(), website: "https://user:secret@example.com" }, "Website must not include a username or password."],
      [{ ...validBody(), pageLimit: 36 }, "Page limit must be a whole number from 1 to 35."],
      [{ ...validBody(), pageLimit: 0 }, "Page limit must be a whole number from 1 to 35."],
      [{ ...validBody(), socials: { instagram: "bad handle" } }, "Instagram must be a handle or an https URL."],
      [{ ...validBody(), testMode: "true" }, "Free test run must be true or false."],
      ["{", "Invalid JSON."],
    ] as const;

    for (const [body, message] of cases) {
      const store = memoryStore();
      const response = await handlePresenceRequest({
        method: "POST",
        path: "/api/admin/presence/runs",
        body: typeof body === "string" ? body : JSON.stringify(body),
        config: testConfig({ realRunsEnabled: true }),
        now: NOW,
        authorize: allow,
        store,
      });
      assert.equal(response.statusCode, body === "{" ? 400 : 422);
      assert.equal((response.body as { error: string }).error, message);
      assert.equal(store.inserts, 0);
    }
  });

  it("refuses a real run while real mode is switched off", async () => {
    const store = memoryStore();
    const response = await postRun(store, { ...validBody(), testMode: false }, testConfig());
    assert.equal(response.statusCode, 409);
    assert.match((response.body as { error: string }).error, /Real runs are switched off/);
    assert.equal(await store.monthSpendPence("2026-10"), 0);
    assert.equal(store.invocations.length, 0);
  });

  it("does not let the client set the price of a real run", async () => {
    const store = memoryStore();
    const config = testConfig({ realRunsEnabled: true, capGbp: 50, estimateGbp: 5 });
    const response = await postRun(store, { ...validBody(), testMode: false, estimatedCostGbp: 0 }, config);
    assert.equal(response.statusCode, 200);
    const body = response.body as { run: { estimatedCostGbp: number; costLabel: string; testMode: boolean } };
    assert.equal(body.run.testMode, false);
    assert.equal(body.run.estimatedCostGbp, 5);
    assert.equal(body.run.costLabel, "Estimated");
    assert.equal(await store.monthSpendPence("2026-10"), 500);
  });

  it("blocks a real run that would pass the monthly cap and still allows a free test run", async () => {
    const store = memoryStore();
    const config = testConfig({ realRunsEnabled: true, capGbp: 10, estimateGbp: 5 });
    assert.equal((await postRun(store, { ...validBody(), businessName: "One", testMode: false }, config)).statusCode, 200);
    assert.equal((await postRun(store, { ...validBody(), businessName: "Two", testMode: false }, config)).statusCode, 200);
    const blocked = await postRun(store, { ...validBody(), businessName: "Three", testMode: false }, config);
    assert.equal(blocked.statusCode, 409);
    assert.match((blocked.body as { error: string }).error, /£10\.00 of the £10\.00 cap/);
    assert.equal(await store.monthSpendPence("2026-10"), 1000);

    const testRun = await postRun(store, { ...validBody(), businessName: "Sample", testMode: true }, config);
    assert.equal(testRun.statusCode, 200);
    const body = testRun.body as { run: { costLabel: string; estimatedCostGbp: number }; spend: { monthToDateGbp: number } };
    assert.equal(body.run.costLabel, "Free");
    assert.equal(body.run.estimatedCostGbp, 0);
    assert.equal(body.spend.monthToDateGbp, 10);
    assert.equal(await store.monthSpendPence("2026-10"), 1000);
  });

  it("allows a real run that lands exactly on the cap", () => {
    assert.equal(capBlocks(500, 500, 1000), false);
    assert.equal(capBlocks(501, 500, 1000), true);
    assert.equal(capBlocks(1000, 0, 1000), false);
  });

  it("releases the reservation when a queued run is cancelled, and keeps it once the run is in progress", async () => {
    const store = memoryStore();
    const config = testConfig({ realRunsEnabled: true, capGbp: 5, estimateGbp: 5 });
    const created = await postRun(store, { ...validBody(), testMode: false }, config);
    const id = (created.body as { run: { id: string } }).run.id;

    const cancelled = await handlePresenceRequest({
      method: "POST",
      path: `/api/admin/presence/runs/${id}/cancel`,
      config,
      now: NOW,
      authorize: allow,
      store,
    });
    assert.equal(cancelled.statusCode, 200);
    assert.equal((cancelled.body as { run: { status: string; costLabel: string } }).run.status, "cancelled");
    assert.equal(await store.monthSpendPence("2026-10"), 0);
    assert.ok(store.objects.has(`runs/${id}/cancel.json`));

    const again = await postRun(store, { ...validBody(), businessName: "After cancel", testMode: false }, config);
    const runningId = (again.body as { run: { id: string } }).run.id;
    const running = await store.getRun(runningId);
    assert.ok(running);
    running.status = "running";
    await store.saveRun(running, null);

    const keep = await handlePresenceRequest({
      method: "POST",
      path: `/api/admin/presence/runs/${runningId}/cancel`,
      config,
      now: NOW,
      authorize: allow,
      store,
    });
    assert.equal(keep.statusCode, 200);
    assert.equal(await store.monthSpendPence("2026-10"), 500);
  });

  it("returns 503 and does not reserve spend when the worker is not deployed", async () => {
    const store = memoryStore();
    const response = await postRun(store, validBody(), testConfig({ workerConfigured: false }));
    assert.equal(response.statusCode, 503);
    assert.equal(store.inserts, 0);
    assert.equal(await store.monthSpendPence("2026-10"), 0);
  });

  it("releases a new reservation when the worker cannot be started, then reserves again on retry", async () => {
    const store = memoryStore();
    store.failInvoke = true;
    const config = testConfig({ realRunsEnabled: true, capGbp: 5, estimateGbp: 5 });
    const response = await postRun(store, { ...validBody(), testMode: false }, config);
    assert.equal(response.statusCode, 502);
    assert.equal(await store.monthSpendPence("2026-10"), 0);
    const failed = (await store.listRuns())[0];
    assert.equal(failed.status, "failed");

    store.failInvoke = false;
    const retried = await handlePresenceRequest({
      method: "POST",
      path: `/api/admin/presence/runs/${failed.id}/retry`,
      config,
      now: NOW,
      authorize: allow,
      store,
    });
    assert.equal(retried.statusCode, 200);
    assert.equal((retried.body as { run: { status: string; attempts: number } }).run.attempts, 2);
    assert.equal(await store.monthSpendPence("2026-10"), 500);

    const held = await store.getRun(failed.id);
    assert.ok(held);
    held.status = "failed";
    await store.saveRun(held, null);
    const overCap = await handlePresenceRequest({
      method: "POST",
      path: `/api/admin/presence/runs/${failed.id}/retry`,
      config,
      now: NOW,
      authorize: allow,
      store,
    });
    assert.equal(overCap.statusCode, 409);
    assert.match((overCap.body as { error: string }).error, /£5\.00 of the £5\.00 cap/);
  });

  it("refuses a download until the PDF is ready, then returns a short-lived URL", async () => {
    const store = memoryStore();
    const created = await postRun(store, validBody(), testConfig());
    const id = (created.body as { run: { id: string } }).run.id;
    const early = await handlePresenceRequest({
      method: "POST",
      path: `/api/admin/presence/runs/${id}/download`,
      config: testConfig(),
      now: NOW,
      authorize: allow,
      store,
    });
    assert.equal(early.statusCode, 409);

    store.markPdf(`runs/${id}/report.pdf`);
    const ready = await handlePresenceRequest({
      method: "POST",
      path: `/api/admin/presence/runs/${id}/download`,
      config: testConfig(),
      now: NOW,
      authorize: allow,
      store,
    });
    assert.equal(ready.statusCode, 200);
    const body = ready.body as { downloadUrl: string; expiresIn: number };
    assert.equal(body.expiresIn, 300);
    assert.match(body.downloadUrl, new RegExp(id));
    const listed = await handlePresenceRequest({
      method: "GET",
      path: "/api/admin/presence/runs",
      config: testConfig(),
      now: NOW,
      authorize: allow,
      store,
    });
    const run = (listed.body as { runs: Array<{ downloadReady: boolean; status: string }> }).runs[0];
    assert.equal(run.status, "completed");
    assert.equal(run.downloadReady, true);
  });

  it("applies a snake_case status file once, and ignores worker cost on a free test run", () => {
    const real = sampleRun({ testMode: false, reservedPence: 500, costSource: "estimate" });
    const first = applyWorkerStatus(
      real,
      { status: "in_progress", progress_percent: 40, message: "Crawling the site" },
      "2026-10-24T19:00:00.000Z",
      500,
    );
    assert.equal(first.costDeltaPence, 0);
    assert.equal(first.run.status, "running");
    assert.equal(first.run.progress, 40);

    const done = applyWorkerStatus(
      first.run,
      { status: "completed", cost_gbp: 3.25, pdf_key: `runs/${real.id}/report.pdf` },
      "2026-10-24T19:10:00.000Z",
      500,
    );
    assert.equal(done.costDeltaPence, -175);
    assert.equal(done.run.reservedPence, 325);
    assert.equal(done.run.costSource, "worker");
    const twice = applyWorkerStatus(done.run, { status: "completed", cost_gbp: 3.25 }, "2026-10-24T19:11:00.000Z", 500);
    assert.equal(twice.costDeltaPence, 0);

    const testRun = sampleRun({ testMode: true, reservedPence: 0, costSource: "test" });
    const ignored = applyWorkerStatus(testRun, { status: "completed", cost_gbp: 9 }, "2026-10-24T19:10:00.000Z", 500);
    assert.equal(ignored.costDeltaPence, 0);
    assert.equal(ignored.run.reservedPence, 0);
    assert.equal(ignored.run.costSource, "test");
  });

  it("does not turn a cancelled run back into a running one", () => {
    const run = sampleRun({ status: "cancelled", costSource: "released", reservedPence: 0 });
    const applied = applyWorkerStatus(run, { status: "running", progress: 10 }, "2026-10-24T19:00:00.000Z", 500);
    assert.equal(applied.run.status, "cancelled");
  });

  it("sends the run id, test flag, and runs prefix to the worker", async () => {
    const store = memoryStore();
    const created = await postRun(store, { ...validBody(), testMode: true, pageLimit: 12 }, testConfig());
    const id = (created.body as { run: { id: string } }).run.id;
    const payload = store.invocations[0] as Record<string, unknown>;
    assert.equal(payload.runId, id);
    assert.equal(payload.run_id, id);
    assert.equal(payload.testMode, true);
    assert.equal(payload.test_mode, true);
    assert.equal(payload.pageLimit, 12);
    assert.equal(payload.page_limit, 12);
    const output = payload.output as { prefix: string; pdfKey: string };
    assert.equal(output.prefix, `runs/${id}/`);
    assert.equal(output.pdfKey, `runs/${id}/report.pdf`);
    assert.deepEqual(store.objects.get(`runs/${id}/input.json`), workerPayload(
      (await store.getRun(id)) as PresenceRun,
      testConfig(),
    ));
  });
});

function validBody() {
  return {
    businessName: "Harbour Cafe",
    website: "https://harbour.example",
    socials: {
      instagram: "harbourcafe",
      facebook: "https://www.facebook.com/harbourcafe",
      tiktok: "",
    },
    location: "Belfast",
    notes: "Independent cafe",
    testMode: true,
  };
}

function testConfig(overrides: Partial<PresenceConfig> = {}): PresenceConfig {
  const capGbp = overrides.capGbp ?? 50;
  const estimateGbp = overrides.estimateGbp ?? 5;
  return {
    pageLimit: 35,
    realRunsEnabled: false,
    defaultTestMode: true,
    workerConfigured: true,
    bucket: "audit-bucket",
    brandConfigPath: "brand.json",
    ...overrides,
    capGbp,
    estimateGbp,
    capPence: Math.round(capGbp * 100),
    estimatePence: Math.round(estimateGbp * 100),
  };
}

async function postRun(store: PresenceStore, body: unknown, config: PresenceConfig) {
  return handlePresenceRequest({
    method: "POST",
    path: "/api/admin/presence/runs",
    body: JSON.stringify(body),
    config,
    now: NOW,
    authorize: allow,
    store,
  });
}

async function allow() {}

function http(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

function sampleRun(overrides: Partial<PresenceRun> = {}): PresenceRun {
  const id = "11111111-1111-4111-8111-111111111111";
  return {
    id,
    businessName: "Harbour Cafe",
    website: "https://harbour.example/",
    socials: { instagram: "", facebook: "", tiktok: "", linkedin: "", youtube: "", x: "" },
    location: "",
    notes: "",
    testMode: true,
    pageLimit: 35,
    status: "queued",
    progress: 0,
    statusMessage: "Queued",
    fileName: "harbour-cafe-presence-audit.pdf",
    s3Prefix: `runs/${id}/`,
    reservedPence: 0,
    costSource: "test",
    attempts: 1,
    month: "2026-10",
    createdAt: "2026-10-24T18:30:00.000Z",
    updatedAt: "2026-10-24T18:30:00.000Z",
    ...overrides,
  };
}

function memoryStore(): PresenceStore & {
  inserts: number;
  invocations: unknown[];
  objects: Map<string, unknown>;
  pdfs: Set<string>;
  failInvoke: boolean;
  markPdf: (key: string) => void;
} {
  const runs = new Map<string, PresenceRun>();
  const spend = new Map<string, number>();
  const objects = new Map<string, unknown>();
  const pdfs = new Set<string>();
  const store = {
    inserts: 0,
    invocations: [] as unknown[],
    objects,
    pdfs,
    failInvoke: false,
    markPdf(key: string) {
      pdfs.add(key);
    },
    async listRuns() {
      return [...runs.values()].map(clone);
    },
    async getRun(id: string) {
      const run = runs.get(id);
      return run ? clone(run) : null;
    },
    async monthSpendPence(month: string) {
      return spend.get(month) || 0;
    },
    async insertRun(run: PresenceRun, reservation: SpendReservation | null) {
      if (runs.has(run.id)) throw http(409, "Run already exists.");
      applySpend(spend, reservation);
      runs.set(run.id, clone(run));
      store.inserts += 1;
    },
    async saveRun(run: PresenceRun, reservation: SpendReservation | null) {
      if (!runs.has(run.id)) throw http(404, "Audit run not found.");
      applySpend(spend, reservation);
      runs.set(run.id, clone(run));
    },
    async writeObject(key: string, body: unknown) {
      objects.set(key, body);
      if (key.endsWith(".pdf")) pdfs.add(key);
    },
    async readObject(key: string) {
      const value = objects.get(key);
      return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
    },
    async pdfExists(key: string) {
      return pdfs.has(key);
    },
    async invoke(payload: unknown) {
      if (store.failInvoke) throw new Error("invoke failed");
      store.invocations.push(payload);
    },
    async presign(key: string, downloadName: string) {
      return `https://downloads.invalid/${encodeURIComponent(key)}?name=${encodeURIComponent(downloadName)}`;
    },
  };
  return store;
}

function applySpend(spend: Map<string, number>, reservation: SpendReservation | null) {
  if (!reservation || reservation.deltaPence === 0) return;
  const current = spend.get(reservation.month) || 0;
  if (reservation.mode === "reserve" && current + reservation.deltaPence > reservation.capPence) {
    throw http(409, "Monthly cap reached.");
  }
  spend.set(reservation.month, Math.max(0, current + reservation.deltaPence));
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
