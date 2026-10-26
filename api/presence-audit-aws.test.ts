import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { createAwsPresenceStore } from "./presence-audit-aws.ts";
import type { PresenceRun, SpendReservation } from "./presence-audit.ts";

const RUN = "01ARZ3NDEKTSV4RRFFQ69G5FAV";

function finishedRun(costUsd: number): PresenceRun {
  return {
    id: RUN,
    businessId: "harbour-cafe",
    company: "Harbour Cafe",
    website: "https://harbour.example",
    handles: { facebook: "VPJebb" },
    business: "",
    area: "Belfast",
    brand: "first_light",
    requestedBy: "admin:test",
    testMode: false,
    status: "succeeded",
    qualityFailures: [],
    fileName: "harbour-cafe-presence-audit.pdf",
    reservedCents: Math.round(costUsd * 100),
    costSource: "worker",
    costUsd,
    month: "2026-10",
    trackingStopped: false,
    createdAt: "2026-10-24T18:30:00.000Z",
    updatedAt: "2026-10-24T18:31:00.000Z",
    finishedAt: "2026-10-24T18:31:00.000Z",
  };
}

type SpendUpdate = {
  Update?: {
    Key?: { PK?: string; SK?: string };
    ConditionExpression?: string;
    UpdateExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
  };
};

function transactItems(command: unknown): SpendUpdate[] {
  const input = (command as { input?: { TransactItems?: SpendUpdate[] } }).input;
  return input?.TransactItems ?? [];
}

function documentClient(sent: unknown[], rejectSpend: boolean): DynamoDBDocumentClient {
  return {
    async send(command: unknown) {
      const items = transactItems(command);
      const writesSpend = items.some((item) => item.Update?.Key?.PK === "PRESENCE_SPEND");
      if (rejectSpend && writesSpend) throw new Error("PRESENCE_SPEND write");
      sent.push(command);
      return {};
    },
  } as unknown as DynamoDBDocumentClient;
}

describe("presence audit DynamoDB reconcile", () => {
  it("skips PRESENCE_SPEND when the cap is off and still writes the run cost", async () => {
    const sent: unknown[] = [];
    process.env.TABLE_NAME = "presence-test";
    const store = createAwsPresenceStore(documentClient(sent, true));
    const reservation: SpendReservation = { month: "2026-10", deltaCents: 125, mode: "reconcile", capCents: 0 };
    await store.saveRun(finishedRun(1.25), reservation, null);
    assert.equal(sent.length, 1);
    const items = transactItems(sent[0]);
    assert.equal(items.length, 1);
    const update = items[0]?.Update;
    assert.equal(update?.Key?.PK, "BIZ#harbour-cafe");
    assert.equal(update?.Key?.SK, `RUN#${RUN}`);
    assert.equal(update?.ExpressionAttributeNames?.["#usd"], "flCostUsd");
    assert.equal(update?.ExpressionAttributeValues?.[":usd"], 1.25);
    assert.equal(JSON.stringify(items).includes("PRESENCE_SPEND"), false);
  });

  it("still writes PRESENCE_SPEND when reconciling against a positive cap", async () => {
    const sent: unknown[] = [];
    process.env.TABLE_NAME = "presence-test";
    const store = createAwsPresenceStore(documentClient(sent, false));
    const reservation: SpendReservation = { month: "2026-10", deltaCents: 200, mode: "reconcile", capCents: 6500 };
    await store.saveRun(finishedRun(8), reservation, null);
    const items = transactItems(sent[0]);
    assert.equal(items.length, 2);
    const spend = items.find((item) => item.Update?.Key?.PK === "PRESENCE_SPEND");
    assert.ok(spend?.Update);
    assert.equal(spend.Update.Key?.SK, "MONTH#2026-10");
    assert.match(spend.Update.ConditionExpression || "", /attribute_exists\(PK\)/);
    assert.equal(spend.Update.ExpressionAttributeValues?.[":delta"], 200);
    const runUpdate = items.find((item) => item.Update?.Key?.PK === "BIZ#harbour-cafe");
    assert.equal(runUpdate?.Update?.ExpressionAttributeValues?.[":usd"], 8);
  });
});
