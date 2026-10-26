import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  handlePresenceRequest,
  loadPresenceConfig,
  monthKey,
  newRunId,
  overlayWorkerResult,
  pdfObjectKey,
  projectRun,
  publicRun,
  resultObjectKey,
  runFromItem,
  runLookupQuery,
  runToItem,
  runsIndexQuery,
  slugifyBusinessId,
  usdToCents,
  validateJob,
  workerPayload,
  RUN_TIMEOUT_MS,
  type InvokeOutcome,
  type PortalClaim,
  type PresenceConfig,
  type PresenceRun,
  type PresenceStore,
  type SpendReservation,
  type WorkerJob,
} from "./presence-audit.ts";

const NOW = new Date("2026-10-24T18:30:00.000Z");
const RUN = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

describe("presence audit config", () => {
  it("leaves the monthly cap off when it is unset, and keeps a $6 estimate, test mode, and no worker", () => {
    const config = loadPresenceConfig({});
    assert.equal(config.capUsd, 0);
    assert.equal(config.capCents, 0);
    assert.equal(config.estimateUsd, 6);
    assert.equal(config.realRunsEnabled, false);
    assert.equal(config.defaultTestMode, true);
    assert.equal(config.workerConfigured, false);
    assert.equal(loadPresenceConfig({ AUDIT_MONTHLY_CAP_USD: "0" }).capUsd, 0);
    assert.equal(loadPresenceConfig({ AUDIT_MONTHLY_CAP_USD: "65" }).capUsd, 65);
  });

  it("ignores malformed money and only enables real runs for the exact string true", () => {
    const config = loadPresenceConfig({
      AUDIT_MONTHLY_CAP_USD: "nope",
      AUDIT_RUN_COST_ESTIMATE_USD: "0",
      AUDIT_REAL_RUNS_ENABLED: "TRUE",
      PRESENCE_DEFAULT_TEST_MODE: "false",
      AUDIT_WORKER_FUNCTION_NAME: "audit-worker",
      AUDIT_REPORTS_BUCKET_NAME: "reports",
    });
    assert.equal(config.capUsd, 0);
    assert.equal(config.estimateUsd, 6);
    assert.equal(config.realRunsEnabled, false);
    assert.equal(config.defaultTestMode, false);
    assert.equal(config.workerConfigured, true);
  });

  it("uses the UTC month", () => {
    assert.equal(monthKey(new Date("2026-10-31T23:30:00.000Z")), "2026-10");
    assert.equal(monthKey(new Date("2026-11-01T00:30:00.000Z")), "2026-11");
  });
});

describe("worker contract", () => {
  it("allocates a 26-character ULID and a slug business id", () => {
    const first = newRunId(1_700_000_000_000, new Uint8Array(10));
    const second = newRunId(1_700_000_000_001, new Uint8Array(10));
    assert.match(first, /^[0-9A-HJKMNP-TV-Z]{26}$/);
    assert.equal(first.length, 26);
    assert.ok(first < second);
    assert.equal(slugifyBusinessId("Harbour & Co Bakery"), "harbour-co-bakery");
  });

  it("builds a payload validate_job accepts and drops fields the worker rejects", () => {
    const run = sampleRun();
    const payload = workerPayload(run);
    assert.deepEqual(validateJob(payload), payload);
    assert.equal(payload.schema, 1);
    assert.equal(payload.run_id, run.id);
    assert.equal(payload.business_id, "harbour-cafe");
    assert.equal(payload.requested_by, "admin:test");
    assert.equal(payload.kind, "admin");
    assert.equal(payload.company, "Harbour Cafe");
    assert.equal(payload.website, "https://harbour.example");
    assert.deepEqual(payload.handles, { instagram: "harbourcafe", facebook: "https://www.facebook.com/VPJebb" });
    assert.equal(payload.brand, "first_light");
    assert.equal(payload.test_mode, true);
    assert.equal(payload.options.compare_to_run_id, null);
    for (const key of ["businessName", "socials", "pageLimit", "page_limit", "bucket", "output", "runId", "testMode"]) {
      assert.equal(key in payload, false);
    }
    assert.throws(() => validateJob({ ...payload, businessName: "Harbour Cafe" }), /unknown field\(s\) businessName/);
    assert.throws(() => validateJob({ ...payload, pageLimit: 35 }), /unknown field\(s\) pageLimit/);
    assert.throws(() => validateJob({ ...payload, bucket: "reports", output: {} }), /unknown field/);
    assert.throws(() => validateJob({ ...payload, handles: { linkedin: "harbour" } }), /unknown field\(s\) linkedin/);
    assert.throws(() => validateJob({ ...payload, run_id: "11111111-1111-4111-8111-111111111111" }), /ULID/);
  });

  it("rejects websites and handles the worker would reject", () => {
    const base = workerPayload(sampleRun({ testMode: false }));
    const websites = [
      "http://harbour.example",
      "https://user:secret@harbour.example",
      "https://localhost/admin",
      "https://127.0.0.1",
      "https://10.1.1.1",
      "https://192.168.0.8",
      "https://172.16.0.1",
      "https://169.254.1.1",
      "https://[::1]/",
      "https://printer.local",
      "https://db.internal",
      "https://app.localhost",
      "https://intranet",
      "https://harbour.example:8443",
      "ftp://harbour.example",
    ];
    for (const website of websites) {
      assert.throws(() => validateJob({ ...base, website }), website);
    }
    assert.doesNotThrow(() => validateJob({ ...base, website: "https://harbour.example:443" }));
    assert.throws(() => validateJob({ ...base, handles: { instagram: "bad handle" } }), /Instagram/);
    assert.equal(validateJob({ ...base, handles: { instagram: "@harbour.cafe" } }).handles.instagram, "harbour.cafe");
    assert.throws(() => validateJob({ ...base, handles: { tiktok: "a" } }), /TikTok/);
    assert.throws(() => validateJob({ ...base, handles: { youtube: "harbour" } }), /youtube/);
    assert.throws(() => validateJob({ ...base, handles: { x: "harbour" } }), /unknown field/);
    for (const facebook of ["Harbour Cafe", "https://www.facebook.com/VP Jebb"]) {
      assert.throws(() => validateJob({ ...base, handles: { facebook } }), /no spaces/);
      assert.throws(() => validateJob({ ...base, handles: { facebook } }), /facebook\.com\/VPJebb/);
    }
    assert.equal(validateJob({ ...base, handles: { facebook: "VPJebb" } }).handles.facebook, "VPJebb");
    assert.equal(
      validateJob({ ...base, handles: { facebook: "https://www.facebook.com/VPJebb" } }).handles.facebook,
      "https://www.facebook.com/VPJebb",
    );
  });

  it("lists runs from GSI1PK=RUNS and does not scan", () => {
    const query = runsIndexQuery("leads");
    assert.equal(query.IndexName, "GSI1");
    assert.equal(query.KeyConditionExpression, "GSI1PK = :pk");
    assert.equal(query.ExpressionAttributeValues[":pk"], "RUNS");
    assert.equal("FilterExpression" in query, false);
    assert.equal(Object.keys(query).join(" "), "TableName IndexName KeyConditionExpression ExpressionAttributeValues ScanIndexForward");
    const lookup = runLookupQuery("leads", RUN);
    assert.equal(lookup.IndexName, "GSI1");
    assert.equal(lookup.FilterExpression, "SK = :sk");
    assert.equal(lookup.ExpressionAttributeValues[":sk"], `RUN#${RUN}`);
  });

  it("round-trips the worker status row", () => {
    const run = sampleRun({ status: "running", startedAt: NOW.toISOString() });
    const item = runToItem(run, workerPayload(run));
    assert.equal(item.PK, "BIZ#harbour-cafe");
    assert.equal(item.SK, `RUN#${RUN}`);
    assert.equal(item.GSI1PK, "RUNS");
    const back = runFromItem(item);
    assert.equal(back?.id, RUN);
    assert.equal(back?.businessId, "harbour-cafe");
    assert.equal(back?.company, "Harbour Cafe");
    assert.equal(back?.status, "running");
  });
});

describe("result states and the cap", () => {
  it("maps gate failures, unreachable, social_required and timeout without calling them completed", () => {
    const run = sampleRun({ testMode: false, reservedCents: 500, costSource: "estimate", status: "running" });
    const review = overlayWorkerResult(run, {
      status: "needs_review",
      quality_gate: { passed: false, failures: ["too_many_pages", "website_not_fetched"] },
      cost_usd: { total: 4 },
      artifacts: { pdf: pdfObjectKey(run) },
    });
    const reviewPublic = publicRun(projectRun(review, NOW, testConfig()).run);
    assert.equal(reviewPublic.status, "needs_review");
    assert.equal(reviewPublic.statusLabel, "Needs review");
    assert.equal(reviewPublic.completed, false);
    assert.equal(reviewPublic.downloadReady, false);
    assert.match(reviewPublic.statusMessage, /longer than 35 pages/);
    assert.match(reviewPublic.statusMessage, /not a completed audit/);

    const unreachableRun = overlayWorkerResult(run, { status: "failed", error: { code: "website_unreachable", message: "the website could not be fetched" } });
    const unreachable = publicRun(unreachableRun);
    assert.equal(unreachable.completed, false);
    assert.match(unreachable.statusMessage, /could not be fetched/);
    const released = projectRun(unreachableRun, NOW, testConfig());
    assert.equal(released.run.costSource, "released");
    assert.equal(released.costDeltaCents, -500);

    const social = publicRun(overlayWorkerResult(run, { status: "cancelled", error: { code: "social_required", message: "Instagram could not be fetched" } }));
    assert.equal(social.status, "cancelled");
    assert.equal(social.completed, false);
    assert.match(social.statusMessage, /cancelled/);

    const timedOut = publicRun(overlayWorkerResult(run, { status: "failed", error: { code: "timeout", message: "the job ran out of time" } }));
    assert.equal(timedOut.statusLabel, "Failed");
    assert.match(timedOut.statusMessage, /ran out of time/);

    const done = overlayWorkerResult(run, { status: "succeeded", quality_gate: { passed: true, failures: [] }, artifacts: { pdf: pdfObjectKey(run) } });
    const donePublic = publicRun(done);
    assert.equal(donePublic.completed, true);
    assert.equal(donePublic.statusLabel, "Completed");
    assert.equal(donePublic.downloadReady, true);
  });

  it("replaces the flat reservation with cost_usd in dollars", () => {
    assert.equal(usdToCents(10), 1000);
    const run = sampleRun({ testMode: false, reservedCents: 600, costSource: "estimate", status: "running" });
    const overlaid = overlayWorkerResult(run, { status: "succeeded", cost_usd: { total: 10, apify_instagram: 10 }, artifacts: { pdf: pdfObjectKey(run) } });
    const projected = projectRun(overlaid, NOW, testConfig());
    assert.equal(projected.costDeltaCents, 400);
    assert.equal(projected.run.reservedCents, 1000);
    assert.equal(projected.run.costSource, "worker");
    const again = projectRun(projected.run, NOW, testConfig());
    assert.equal(again.costDeltaCents, 0);
    const failedWithCost = projectRun(
      overlayWorkerResult(run, { status: "failed", error: { code: "internal", message: "stopped" }, cost_usd: { total: 1.5 } }),
      NOW,
      testConfig(),
    );
    assert.equal(failedWithCost.run.reservedCents, 150);
    assert.equal(failedWithCost.run.costSource, "worker");

    const free = projectRun(
      overlayWorkerResult(sampleRun(), { status: "succeeded", cost_usd: { total: 9 } }),
      NOW,
      testConfig(),
    );
    assert.equal(free.costDeltaCents, 0);
    assert.equal(free.run.reservedCents, 0);
    assert.equal(free.run.costSource, "test");
  });

  it("fails a run that has been running for more than 16 minutes and releases the estimate", () => {
    const started = new Date(NOW.getTime() - RUN_TIMEOUT_MS - 1000).toISOString();
    const stuck = sampleRun({
      testMode: false,
      status: "running",
      startedAt: started,
      reservedCents: 500,
      costSource: "estimate",
    });
    const projected = projectRun(stuck, NOW, testConfig());
    assert.equal(projected.claim, "timeout");
    assert.equal(projected.run.status, "failed");
    assert.equal(projected.run.errorCode, "timeout");
    assert.equal(projected.costDeltaCents, -500);
    assert.equal(projected.run.reservedCents, 0);
    assert.equal(projected.run.costSource, "released");

    const notYet = projectRun({ ...stuck, startedAt: new Date(NOW.getTime() - RUN_TIMEOUT_MS).toISOString() }, NOW, testConfig());
    assert.equal(notYet.claim, null);
    assert.equal(notYet.run.status, "running");
  });
});

describe("presence audit API", () => {
  it("requires auth before listing, creating, or cancelling", async () => {
    const created = sampleRun();
    for (const request of [
      { method: "GET", path: "/api/admin/presence/runs" },
      { method: "POST", path: "/api/admin/presence/runs", body: JSON.stringify(validBody()) },
      { method: "POST", path: `/api/admin/presence/runs/${created.id}/cancel` },
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
      assert.equal(store.inserts, 0);
      assert.equal(store.invocations.length, 0);
    }
  });

  it("rejects fields and websites the worker does not accept", async () => {
    const cases: Array<[unknown, RegExp]> = [
      [{ ...validBody(), company: "  " }, /company is required/],
      [{ ...validBody(), businessName: "Harbour Cafe" }, /Unknown field businessName/],
      [{ ...validBody(), pageLimit: 35 }, /Unknown field pageLimit/],
      [{ ...validBody(), socials: { instagram: "harbour" } }, /Unknown field socials/],
      [{ ...validBody(), website: "http://harbour.example" }, /https:\/\//],
      [{ ...validBody(), website: "https://169.254.1.1" }, /IP address or internal host/],
      [{ ...validBody(), website: "https://printer.local" }, /internal host/],
      [{ ...validBody(), handles: { linkedin: "harbour", instagram: "harbour" } }, /linkedin/],
      [{ ...validBody(), handles: { instagram: "bad handle" } }, /Instagram/],
      [{ ...validBody(), handles: { facebook: "Harbour Cafe" } }, /no spaces/],
      [{ ...validBody(), handles: { facebook: "https://www.facebook.com/VP Jebb" } }, /facebook\.com\/VPJebb/],
      [{ ...validBody(), testMode: "true" }, /true or false/],
      ["{", /Invalid JSON/],
    ];
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
      assert.match((response.body as { error: string }).error, message);
      assert.equal(store.inserts, 0);
    }
  });

  it("refuses a real run while real mode is switched off", async () => {
    const store = memoryStore();
    const response = await postRun(store, { ...validBody(), testMode: false }, testConfig());
    assert.equal(response.statusCode, 409);
    assert.match((response.body as { error: string }).error, /Real runs are switched off/);
    assert.equal(await store.monthSpendCents("2026-10"), 0);
  });

  it("reserves the flat estimate for a real run and ignores a client cost", async () => {
    const store = memoryStore();
    const rejected = await postRun(store, { ...validBody(), testMode: false, estimatedCostUsd: 0 }, testConfig({ realRunsEnabled: true }));
    assert.equal(rejected.statusCode, 422);
    const response = await postRun(store, { ...validBody(), testMode: false }, testConfig({ realRunsEnabled: true }));
    assert.equal(response.statusCode, 200);
    const body = response.body as { run: { estimatedCostUsd: number; costLabel: string; testMode: boolean; id: string } };
    assert.equal(body.run.testMode, false);
    assert.equal(body.run.estimatedCostUsd, 6);
    assert.equal(body.run.costLabel, "Estimated");
    assert.match(body.run.id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
    assert.equal(await store.monthSpendCents("2026-10"), 600);
  });

  it("starts real runs when the monthly cap is off and still records cost_usd", async () => {
    const store = memoryStore();
    const config = testConfig({ realRunsEnabled: true, capUsd: 0, estimateUsd: 6 });
    const first = await postRun(store, { ...validBody(), testMode: false }, config);
    assert.equal(first.statusCode, 200);
    const started = (first.body as { run: { id: string; estimatedCostUsd: number } }).run;
    assert.equal(started.estimatedCostUsd, 0);
    assert.equal(await store.monthSpendCents("2026-10"), 0);
    const stored = await store.getRun(started.id);
    assert.ok(stored);
    store.objects.set(resultObjectKey(stored), {
      status: "succeeded",
      cost_usd: { total: 1.25 },
      quality_gate: { passed: true, failures: [] },
      artifacts: { pdf: pdfObjectKey(stored) },
    });
    const read = await handlePresenceRequest({
      method: "GET",
      path: `/api/admin/presence/runs/${started.id}`,
      config,
      now: NOW,
      authorize: allow,
      store,
    });
    assert.equal(read.statusCode, 200);
    const recorded = (read.body as { run: { costUsd?: number; status: string } }).run;
    assert.equal(recorded.status, "succeeded");
    assert.equal(recorded.costUsd, 1.25);
    const saved = await store.getRun(started.id);
    assert.equal(saved?.costUsd, 1.25);
    assert.equal(saved?.costSource, "worker");
    assert.equal(await store.monthSpendCents("2026-10"), 0);
    const second = await postRun(store, { ...validBody(), company: "Second Co", testMode: false }, config);
    assert.equal(second.statusCode, 200);
    assert.equal(await store.monthSpendCents("2026-10"), 0);
  });

  it("blocks a real run past the cap and still allows a free test", async () => {
    const store = memoryStore();
    const config = testConfig({ realRunsEnabled: true, capUsd: 10, estimateUsd: 5 });
    const first = await postRun(store, { ...validBody(), company: "One Co", testMode: false }, config);
    assert.equal(first.statusCode, 200);
    await finishSucceeded(store, (first.body as { run: { id: string } }).run.id, config);
    const second = await postRun(store, { ...validBody(), company: "Two Co", testMode: false }, config);
    assert.equal(second.statusCode, 200);
    await finishSucceeded(store, (second.body as { run: { id: string } }).run.id, config);
    const blocked = await postRun(store, { ...validBody(), company: "Three Co", testMode: false }, config);
    assert.equal(blocked.statusCode, 409);
    assert.match((blocked.body as { error: string }).error, /\$10\.00 of the \$10\.00 cap/);
    const testRun = await postRun(store, { ...validBody(), company: "Sample Co", testMode: true }, config);
    assert.equal(testRun.statusCode, 200);
    assert.equal((testRun.body as { run: { costLabel: string } }).run.costLabel, "Free");
    assert.equal(await store.monthSpendCents("2026-10"), 1000);
  });

  it("applies a bad_input invoke result immediately and releases the reservation", async () => {
    const store = memoryStore();
    store.invokePayload = { status: "failed", error: { code: "bad_input", message: "website must be a public domain name" } };
    const config = testConfig({ realRunsEnabled: true });
    const response = await postRun(store, { ...validBody(), testMode: false }, config);
    assert.equal(response.statusCode, 200);
    const run = (response.body as { run: { status: string; errorCode?: string; statusLabel: string; completed: boolean } }).run;
    assert.equal(run.status, "failed");
    assert.equal(run.errorCode, "bad_input");
    assert.equal(run.statusLabel, "Failed");
    assert.equal(run.completed, false);
    assert.equal(await store.monthSpendCents("2026-10"), 0);
    assert.notEqual((await store.listRuns())[0]?.status, "queued");
  });

  it("releases the reservation when tracking is stopped and says spend may already be committed", async () => {
    const store = memoryStore();
    const config = testConfig({ realRunsEnabled: true });
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
    const body = cancelled.body as { run: { trackingStopped: boolean; statusMessage: string; status: string; costLabel: string } };
    assert.equal(body.run.trackingStopped, true);
    assert.equal(body.run.status, "queued");
    assert.match(body.run.statusMessage, /no cancel/);
    assert.match(body.run.statusMessage, /spend may already be committed/);
    assert.equal(body.run.costLabel, "Released");
    assert.equal(await store.monthSpendCents("2026-10"), 0);
    assert.equal(store.objects.has(`runs/harbour-cafe/${id}/cancel.json`), false);
  });

  it("refuses a new run after stop-tracking until the worker finishes or 16 minutes pass", async () => {
    const config = testConfig({ realRunsEnabled: true });
    const store = memoryStore();
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
    const blocked = await postRun(store, { ...validBody(), company: "Second Co", testMode: true }, config);
    assert.equal(blocked.statusCode, 409);
    assert.equal((blocked.body as { error: string }).error, "A run is already in progress.");
    assert.equal(store.inserts, 1);

    const stored = await store.getRun(id);
    assert.ok(stored);
    stored.status = "succeeded";
    stored.finishedAt = NOW.toISOString();
    await store.saveRun(stored, null, null);
    const afterTerminal = await postRun(store, { ...validBody(), company: "Second Co", testMode: true }, config);
    assert.equal(afterTerminal.statusCode, 200);

    const aged = memoryStore();
    const first = await postRun(aged, { ...validBody(), testMode: false }, config);
    const agedId = (first.body as { run: { id: string } }).run.id;
    const stopped = await handlePresenceRequest({
      method: "POST",
      path: `/api/admin/presence/runs/${agedId}/cancel`,
      config,
      now: NOW,
      authorize: allow,
      store: aged,
    });
    assert.equal(stopped.statusCode, 200);
    const row = await aged.getRun(agedId);
    assert.ok(row);
    row.startedAt = new Date(NOW.getTime() - RUN_TIMEOUT_MS - 1000).toISOString();
    await aged.saveRun(row, null, null);
    const afterTimeout = await postRun(aged, { ...validBody(), company: "Later Co", testMode: false }, config);
    assert.equal(afterTimeout.statusCode, 200);
    const timedOut = await aged.getRun(agedId);
    assert.equal(timedOut?.status, "failed");
    assert.equal(timedOut?.errorCode, "timeout");
    assert.equal(await aged.monthSpendCents("2026-10"), 600);
  });

  it("refuses a second run while one is queued or running", async () => {
    const store = memoryStore();
    const config = testConfig();
    assert.equal((await postRun(store, validBody(), config)).statusCode, 200);
    const blocked = await postRun(store, { ...validBody(), company: "Second Co", testMode: false }, testConfig({ realRunsEnabled: true }));
    assert.equal(blocked.statusCode, 409);
    assert.equal((blocked.body as { error: string }).error, "A run is already in progress.");
    assert.equal(store.inserts, 1);
    assert.equal(await store.monthSpendCents("2026-10"), 0);
  });

  it("allows a new run when the previous one is older than 16 minutes and releases that reservation", async () => {
    const store = memoryStore();
    const config = testConfig({ realRunsEnabled: true });
    const created = await postRun(store, { ...validBody(), testMode: false }, config);
    const id = (created.body as { run: { id: string } }).run.id;
    const stored = await store.getRun(id);
    assert.ok(stored);
    stored.startedAt = new Date(NOW.getTime() - RUN_TIMEOUT_MS - 1000).toISOString();
    await store.saveRun(stored, null, null);

    const next = await postRun(store, { ...validBody(), company: "Second Co", testMode: false }, config);
    assert.equal(next.statusCode, 200);
    const first = await store.getRun(id);
    assert.equal(first?.status, "failed");
    assert.equal(first?.errorCode, "timeout");
    assert.equal(await store.monthSpendCents("2026-10"), 600);
  });

  it("accepts a new run when the worker already wrote a terminal status before the portal read it", async () => {
    const config = testConfig({ realRunsEnabled: true });
    for (const status of ["succeeded", "needs_review", "failed"] as const) {
      const store = memoryStore();
      const created = await postRun(store, { ...validBody(), testMode: false }, config);
      assert.equal(created.statusCode, 200);
      const id = (created.body as { run: { id: string } }).run.id;
      const stored = await store.getRun(id);
      assert.ok(stored);
      stored.status = status;
      stored.finishedAt = NOW.toISOString();
      if (status === "failed") {
        stored.errorCode = "internal";
        stored.errorMessage = "worker failed";
      }
      await store.saveRun(stored, null, null);
      const next = await postRun(store, { ...validBody(), company: "Next Co", testMode: true }, config);
      assert.equal(next.statusCode, 200, status);
      assert.equal((next.body as { error?: string }).error, undefined, status);
    }
  });

  it("allows a new run after the previous one succeeds or fails", async () => {
    const store = memoryStore();
    const config = testConfig({ realRunsEnabled: true });
    const created = await postRun(store, { ...validBody(), testMode: false }, config);
    const id = (created.body as { run: { id: string } }).run.id;
    await finishSucceeded(store, id, config);
    const afterSuccess = await postRun(store, { ...validBody(), company: "Second Co", testMode: false }, config);
    assert.equal(afterSuccess.statusCode, 200);

    const failedStore = memoryStore();
    failedStore.invokePayload = { status: "failed", error: { code: "website_unreachable", message: "no answer" } };
    const failed = await postRun(failedStore, { ...validBody(), testMode: false }, config);
    assert.equal(failed.statusCode, 200);
    assert.equal((failed.body as { run: { status: string } }).run.status, "failed");
    const afterFailure = await postRun(failedStore, { ...validBody(), company: "Third Co", testMode: true }, config);
    assert.equal(afterFailure.statusCode, 200);
  });

  it("returns 503 and does not reserve spend when the worker is not deployed", async () => {
    const store = memoryStore();
    const response = await postRun(store, validBody(), testConfig({ workerConfigured: false, bucket: "" }));
    assert.equal(response.statusCode, 503);
    assert.equal(store.inserts, 0);
    assert.equal(await store.monthSpendCents("2026-10"), 0);
  });

  it("releases a reservation when invoke fails, then reserves a new run on retry", async () => {
    const store = memoryStore();
    store.failInvoke = true;
    const config = testConfig({ realRunsEnabled: true, capUsd: 5, estimateUsd: 5 });
    const response = await postRun(store, { ...validBody(), testMode: false }, config);
    assert.equal(response.statusCode, 502);
    assert.equal(await store.monthSpendCents("2026-10"), 0);
    const failed = (await store.listRuns())[0];
    assert.equal(failed?.status, "failed");

    store.failInvoke = false;
    const retried = await handlePresenceRequest({
      method: "POST",
      path: `/api/admin/presence/runs/${failed?.id}/retry`,
      config,
      now: NOW,
      authorize: allow,
      store,
    });
    assert.equal(retried.statusCode, 200);
    const retryBody = retried.body as { run: { id: string; status: string } };
    assert.notEqual(retryBody.run.id, failed?.id);
    assert.match(retryBody.run.id, /^[0-9A-HJKMNP-TV-Z]{26}$/);
    const sent = store.invocations.at(-1) as WorkerJob;
    assert.equal(sent.options.compare_to_run_id, failed?.id);
    assert.equal(await store.monthSpendCents("2026-10"), 500);
    await finishSucceeded(store, retryBody.run.id, config);

    const blocked = await postRun(store, { ...validBody(), company: "Second Co", testMode: false }, config);
    assert.equal(blocked.statusCode, 409);
    assert.match((blocked.body as { error: string }).error, /\$5\.00 of the \$5\.00 cap/);
  });

  it("downloads only a succeeded result, and a PDF alone does not complete the run", async () => {
    const store = memoryStore();
    const created = await postRun(store, validBody(), testConfig());
    const run = (created.body as { run: { id: string; businessId: string } }).run;
    store.markPdf(pdfObjectKey({ businessId: run.businessId, id: run.id }));
    const early = await handlePresenceRequest({
      method: "POST",
      path: `/api/admin/presence/runs/${run.id}/download`,
      config: testConfig(),
      now: NOW,
      authorize: allow,
      store,
    });
    assert.equal(early.statusCode, 409);

    store.objects.set(resultObjectKey({ businessId: run.businessId, id: run.id }), {
      status: "needs_review",
      quality_gate: { passed: false, failures: ["too_many_pages"] },
      artifacts: { pdf: pdfObjectKey(run) },
    });
    const review = await handlePresenceRequest({
      method: "GET",
      path: `/api/admin/presence/runs/${run.id}`,
      config: testConfig(),
      now: NOW,
      authorize: allow,
      store,
    });
    const reviewRun = (review.body as { run: { status: string; completed: boolean; downloadReady: boolean; statusMessage: string } }).run;
    assert.equal(reviewRun.status, "needs_review");
    assert.equal(reviewRun.completed, false);
    assert.equal(reviewRun.downloadReady, false);
    assert.match(reviewRun.statusMessage, /35 pages/);

    store.objects.set(resultObjectKey(run), {
      status: "succeeded",
      quality_gate: { passed: true, failures: [] },
      artifacts: { pdf: pdfObjectKey(run) },
    });
    const ready = await handlePresenceRequest({
      method: "POST",
      path: `/api/admin/presence/runs/${run.id}/download`,
      config: testConfig(),
      now: NOW,
      authorize: allow,
      store,
    });
    assert.equal(ready.statusCode, 200);
    assert.equal((ready.body as { expiresIn: number }).expiresIn, 300);
  });

  it("releases the cap when a running run is still open after 16 minutes", async () => {
    const store = memoryStore();
    const config = testConfig({ realRunsEnabled: true });
    const created = await postRun(store, { ...validBody(), testMode: false }, config);
    const id = (created.body as { run: { id: string } }).run.id;
    const stored = await store.getRun(id);
    assert.ok(stored);
    stored.status = "running";
    stored.startedAt = new Date(NOW.getTime() - RUN_TIMEOUT_MS - 1000).toISOString();
    await store.saveRun(stored, null, null);
    const listed = await handlePresenceRequest({
      method: "GET",
      path: "/api/admin/presence/runs",
      config,
      now: NOW,
      authorize: allow,
      store,
    });
    const run = (listed.body as { runs: Array<{ status: string; errorCode?: string; completed: boolean }> }).runs[0];
    assert.equal(run?.status, "failed");
    assert.equal(run?.errorCode, "timeout");
    assert.equal(run?.completed, false);
    assert.equal(await store.monthSpendCents("2026-10"), 0);
  });

  it("replaces the flat reservation with the worker cost_usd on the next read", async () => {
    const store = memoryStore();
    const config = testConfig({ realRunsEnabled: true });
    const created = await postRun(store, { ...validBody(), testMode: false }, config);
    const body = created.body as { run: { id: string; businessId: string } };
    store.objects.set(resultObjectKey(body.run), {
      status: "succeeded",
      cost_usd: { total: 8 },
      artifacts: { pdf: pdfObjectKey(body.run) },
    });
    store.markPdf(pdfObjectKey(body.run));
    const listed = await handlePresenceRequest({
      method: "GET",
      path: "/api/admin/presence/runs",
      config,
      now: NOW,
      authorize: allow,
      store,
    });
    const run = (listed.body as { runs: Array<{ costLabel: string; estimatedCostUsd: number; costUsd?: number; completed: boolean }> }).runs[0];
    assert.equal(run?.completed, true);
    assert.equal(run?.costUsd, 8);
    assert.equal(run?.estimatedCostUsd, 8);
    assert.equal(run?.costLabel, "Actual");
    assert.equal(await store.monthSpendCents("2026-10"), 800);
  });

  it("sends the worker job and not the old output contract", async () => {
    const store = memoryStore();
    const created = await postRun(store, validBody(), testConfig());
    const id = (created.body as { run: { id: string; businessId: string } }).run.id;
    const payload = store.invocations[0] as WorkerJob;
    assert.equal(validateJob(payload).run_id, payload.run_id);
    assert.equal(payload.run_id, id);
    assert.equal(payload.business_id, "harbour-cafe");
    assert.equal(payload.test_mode, true);
    assert.equal(payload.brand, "first_light");
    assert.equal("output" in payload, false);
    assert.equal("pageLimit" in payload, false);
    assert.equal(store.objects.has(`runs/${id}/input.json`), false);
    assert.equal(store.objects.has(`runs/harbour-cafe/${id}/input.json`), false);
  });
});

function validBody() {
  return {
    company: "Harbour Cafe",
    website: "https://harbour.example",
    handles: { instagram: "@harbourcafe", facebook: "https://www.facebook.com/VPJebb", tiktok: "" },
    area: "Belfast",
    testMode: true,
  };
}

function testConfig(overrides: Partial<PresenceConfig> = {}): PresenceConfig {
  const capUsd = overrides.capUsd ?? 65;
  const estimateUsd = overrides.estimateUsd ?? 6;
  return {
    realRunsEnabled: false,
    defaultTestMode: true,
    workerConfigured: true,
    bucket: "audit-bucket",
    ...overrides,
    capUsd,
    estimateUsd,
    capCents: Math.round(capUsd * 100),
    estimateCents: Math.round(estimateUsd * 100),
  };
}

async function finishSucceeded(
  store: ReturnType<typeof memoryStore>,
  id: string,
  config: PresenceConfig,
) {
  const run = await store.getRun(id);
  assert.ok(run);
  store.objects.set(resultObjectKey(run), {
    status: "succeeded",
    quality_gate: { passed: true, failures: [] },
    artifacts: { pdf: pdfObjectKey(run) },
  });
  const response = await handlePresenceRequest({
    method: "GET",
    path: `/api/admin/presence/runs/${id}`,
    config,
    now: NOW,
    authorize: allow,
    store,
  });
  assert.equal((response.body as { run: { status: string } }).run.status, "succeeded");
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

async function allow() {
  return "admin:test";
}

function http(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}

function sampleRun(overrides: Partial<PresenceRun> = {}): PresenceRun {
  return {
    id: RUN,
    businessId: "harbour-cafe",
    company: "Harbour Cafe",
    website: "https://harbour.example",
    handles: { instagram: "harbourcafe", facebook: "https://www.facebook.com/VPJebb" },
    business: "",
    area: "Belfast",
    brand: "first_light",
    requestedBy: "admin:test",
    testMode: true,
    status: "queued",
    qualityFailures: [],
    fileName: "harbour-cafe-presence-audit.pdf",
    reservedCents: 0,
    costSource: "test",
    month: "2026-10",
    trackingStopped: false,
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

function memoryStore(): PresenceStore & {
  inserts: number;
  invocations: unknown[];
  objects: Map<string, unknown>;
  pdfs: Set<string>;
  failInvoke: boolean;
  invokePayload: Record<string, unknown> | null;
  markPdf: (key: string) => void;
} {
  const runs = new Map<string, PresenceRun>();
  const spend = new Map<string, number>();
  let lock: { holder: string; expiresAt: string } | null = null;
  const objects = new Map<string, unknown>();
  const pdfs = new Set<string>();
  const store = {
    inserts: 0,
    invocations: [] as unknown[],
    objects,
    pdfs,
    failInvoke: false,
    invokePayload: null as Record<string, unknown> | null,
    markPdf(key: string) {
      pdfs.add(key);
    },
    async listRuns() {
      return [...runs.values()].map(clone);
    },
    async getRun(id: string) {
      const run = [...runs.values()].find((item) => item.id === id);
      return run ? clone(run) : null;
    },
    async monthSpendCents(month: string) {
      return spend.get(month) || 0;
    },
    async insertRun(run: PresenceRun, reservation: SpendReservation | null) {
      if ([...runs.values()].some((item) => item.id === run.id)) throw http(409, "Run already exists.");
      applySpend(spend, reservation);
      runs.set(run.id, clone(run));
      store.inserts += 1;
    },
    async saveRun(run: PresenceRun, reservation: SpendReservation | null, claim: PortalClaim | null) {
      const current = runs.get(run.id);
      if (!current) throw http(404, "Audit run not found.");
      if (claim && current.status !== "queued" && current.status !== "running") throw http(409, "The run already moved on.");
      applySpend(spend, reservation);
      runs.set(run.id, clone(run));
    },
    async readObject(key: string) {
      const value = objects.get(key);
      return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
    },
    async pdfExists(key: string) {
      return pdfs.has(key);
    },
    async invoke(payload: WorkerJob): Promise<InvokeOutcome> {
      if (store.failInvoke) throw new Error("invoke failed");
      store.invocations.push(payload);
      return { statusCode: 202, payload: store.invokePayload };
    },
    async presign(key: string, downloadName: string) {
      return `https://downloads.invalid/${encodeURIComponent(key)}?name=${encodeURIComponent(downloadName)}`;
    },
    async getRunLock() {
      return lock ? { holder: lock.holder, expiresAt: lock.expiresAt } : null;
    },
    async acquireRunLock(runId: string, now: Date) {
      const expiresAt = new Date(now.getTime() + RUN_TIMEOUT_MS).toISOString();
      if (lock && lock.expiresAt >= now.toISOString() && lock.holder !== runId) return false;
      lock = { holder: runId, expiresAt };
      return true;
    },
    async releaseRunLock(runId: string) {
      if (lock?.holder === runId) lock = null;
    },
  };
  return store;
}

function applySpend(spend: Map<string, number>, reservation: SpendReservation | null) {
  if (!reservation || reservation.deltaCents === 0) return;
  const current = spend.get(reservation.month) || 0;
  if (reservation.mode === "reserve" && current + reservation.deltaCents > reservation.capCents) {
    throw http(409, "Monthly cap reached.");
  }
  if (reservation.deltaCents < 0 && current < -reservation.deltaCents) throw http(409, "Spend update skipped.");
  spend.set(reservation.month, current + reservation.deltaCents);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
