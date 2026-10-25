import { DynamoDBClient, TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  PRESENCE_LOCK_PK,
  PRESENCE_LOCK_SK,
  PRESENCE_SPEND_PK,
  PresenceError,
  RUN_TIMEOUT_MS,
  runFromItem,
  runLookupQuery,
  runToItem,
  runsIndexQuery,
  workerPayload,
  type PortalClaim,
  type PresenceRun,
  type PresenceStore,
  type SpendReservation,
} from "./presence-audit";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const lambda = new LambdaClient({});
const DOWNLOAD_SECONDS = 300;

export function createAwsPresenceStore(): PresenceStore {
  const tableName = process.env.TABLE_NAME || "";
  const bucket = process.env.AUDIT_REPORTS_BUCKET_NAME || "";

  return {
    listRuns: () => listRuns(tableName),
    getRun: (id) => getRun(tableName, id),
    monthSpendCents: (month) => monthSpendCents(tableName, month),
    insertRun: (run, reservation) => insertRun(tableName, run, reservation),
    saveRun: (run, reservation, claim) => saveRun(tableName, run, reservation, claim),
    acquireRunLock: (runId, now) => acquireRunLock(tableName, runId, now),
    releaseRunLock: (runId) => releaseRunLock(tableName, runId),
    readObject: (key) => readObject(bucket, key),
    pdfExists: (key) => pdfExists(bucket, key),
    invoke: (payload) => invokeWorker(payload),
    presign: (key, downloadName) => presignPdf(bucket, key, downloadName),
  };
}

async function listRuns(tableName: string) {
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await db.send(new QueryCommand(runsIndexQuery(tableName, exclusiveStartKey)));
    items.push(...((page.Items || []) as Record<string, unknown>[]));
    exclusiveStartKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);
  return items.map(runFromItem).filter((run): run is PresenceRun => Boolean(run));
}

async function getRun(tableName: string, id: string) {
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const page = await db.send(new QueryCommand(runLookupQuery(tableName, id, exclusiveStartKey)));
    for (const item of page.Items || []) {
      const run = runFromItem(item as Record<string, unknown>);
      if (run?.id === id) return run;
    }
    exclusiveStartKey = page.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);
  return null;
}

async function monthSpendCents(tableName: string, month: string) {
  const result = await db.send(
    new GetCommand({ TableName: tableName, Key: { PK: PRESENCE_SPEND_PK, SK: `MONTH#${month}` } }),
  );
  const amount = result.Item?.amountCents;
  return typeof amount === "number" && Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
}

async function insertRun(tableName: string, run: PresenceRun, reservation: SpendReservation | null) {
  const put = {
    Put: {
      TableName: tableName,
      Item: runToItem(run, workerPayload(run)),
      ConditionExpression: "attribute_not_exists(PK)",
    },
  };
  const spend = reservation && reservation.deltaCents !== 0 ? spendChange(tableName, reservation) : undefined;
  try {
    await db.send(new TransactWriteCommand({ TransactItems: spend ? [put, spend] : [put] }));
  } catch (error) {
    if (reservation?.mode === "reserve" && isConditionalFailure(error)) throw new PresenceError(409, "Monthly cap reached.");
    throw error;
  }
}

async function saveRun(
  tableName: string,
  run: PresenceRun,
  reservation: SpendReservation | null,
  claim: PortalClaim | null,
) {
  const update = runUpdate(tableName, run, claim);
  const spend = reservation && reservation.deltaCents !== 0 ? spendChange(tableName, reservation) : undefined;
  try {
    await db.send(new TransactWriteCommand({ TransactItems: spend ? [update, spend] : [update] }));
  } catch (error) {
    if (reservation?.mode === "reserve" && isConditionalFailure(error)) throw new PresenceError(409, "Monthly cap reached.");
    if (claim && isConditionalFailure(error)) throw new PresenceError(409, "The run already moved on.");
    if (reservation && isConditionalFailure(error)) {
      console.error("Presence spend update was skipped.");
      await db.send(new UpdateCommand(runUpdate(tableName, run, null).Update));
      return;
    }
    throw error;
  }
}

function runUpdate(tableName: string, run: PresenceRun, claim: PortalClaim | null) {
  const names: Record<string, string> = {
    "#pence": "flReservedCents",
    "#source": "flCostSource",
    "#month": "flMonth",
    "#tracked": "flTracked",
    "#updated": "flUpdatedAt",
    "#file": "flFileName",
  };
  const values: Record<string, unknown> = {
    ":pence": run.reservedCents,
    ":source": run.costSource,
    ":month": run.month,
    ":tracked": !run.trackingStopped,
    ":updated": run.updatedAt,
    ":file": run.fileName,
  };
  const sets = [
    "#pence = :pence",
    "#source = :source",
    "#month = :month",
    "#tracked = :tracked",
    "#updated = :updated",
    "#file = :file",
  ];
  if (run.costUsd !== undefined) {
    names["#usd"] = "flCostUsd";
    values[":usd"] = run.costUsd;
    sets.push("#usd = :usd");
  }
  if (claim) {
    names["#status"] = "status";
    names["#error"] = "error";
    values[":status"] = run.status;
    values[":error"] = { code: run.errorCode || claim, message: run.errorMessage || "" };
    values[":finished"] = run.finishedAt || run.updatedAt;
    values[":queued"] = "queued";
    values[":running"] = "running";
    sets.push("#status = :status", "#error = :error", "finished_at = :finished");
  }
  return {
    Update: {
      TableName: tableName,
      Key: { PK: `BIZ#${run.businessId}`, SK: `RUN#${run.id}` },
      UpdateExpression: `SET ${sets.join(", ")}`,
      ...(claim
        ? { ConditionExpression: "attribute_not_exists(#status) OR #status = :queued OR #status = :running" }
        : {}),
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    },
  };
}

function spendChange(tableName: string, reservation: SpendReservation) {
  const values: Record<string, unknown> = { ":delta": reservation.deltaCents };
  let update = "ADD amountCents :delta";
  let condition = "attribute_exists(PK)";
  if (reservation.mode === "reserve") {
    update =
      "ADD amountCents :delta, runCount :one SET entityType = if_not_exists(entityType, :entity), monthKey = if_not_exists(monthKey, :month)";
    values[":one"] = 1;
    values[":entity"] = "PRESENCE_SPEND";
    values[":month"] = reservation.month;
    values[":maxBefore"] = reservation.capCents - reservation.deltaCents;
    condition = "attribute_not_exists(amountCents) OR amountCents <= :maxBefore";
  } else if (reservation.deltaCents < 0) {
    update = "ADD amountCents :delta";
    values[":need"] = -reservation.deltaCents;
    condition = "attribute_exists(amountCents) AND amountCents >= :need";
  }
  return {
    Update: {
      TableName: tableName,
      Key: { PK: PRESENCE_SPEND_PK, SK: `MONTH#${reservation.month}` },
      UpdateExpression: update,
      ConditionExpression: condition,
      ExpressionAttributeValues: values,
    },
  };
}

async function acquireRunLock(tableName: string, runId: string, now: Date) {
  const expiresMs = now.getTime() + RUN_TIMEOUT_MS;
  try {
    await db.send(
      new PutCommand({
        TableName: tableName,
        Item: {
          PK: PRESENCE_LOCK_PK,
          SK: PRESENCE_LOCK_SK,
          entityType: "PRESENCE_LOCK",
          holder: runId,
          expiresAt: new Date(expiresMs).toISOString(),
          ttl: Math.floor(expiresMs / 1000),
        },
        ConditionExpression: "attribute_not_exists(PK) OR expiresAt < :now OR holder = :holder",
        ExpressionAttributeValues: { ":now": now.toISOString(), ":holder": runId },
      }),
    );
    return true;
  } catch (error) {
    if (isConditionalCheck(error)) return false;
    throw error;
  }
}

async function releaseRunLock(tableName: string, runId: string) {
  try {
    await db.send(
      new DeleteCommand({
        TableName: tableName,
        Key: { PK: PRESENCE_LOCK_PK, SK: PRESENCE_LOCK_SK },
        ConditionExpression: "holder = :holder",
        ExpressionAttributeValues: { ":holder": runId },
      }),
    );
  } catch (error) {
    if (isConditionalCheck(error)) return;
    throw error;
  }
}

async function readObject(bucket: string, key: string) {
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const text = await readBody(result.Body);
    if (!text) return null;
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (isMissingObject(error)) return null;
    throw error;
  }
}

async function pdfExists(bucket: string, key: string) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    if (isMissingObject(error)) return false;
    throw error;
  }
}

async function invokeWorker(payload: unknown) {
  const functionName = process.env.AUDIT_WORKER_FUNCTION_NAME?.trim() || "";
  if (!functionName) throw new PresenceError(503, "The audit worker is not deployed on this stack yet.");
  // Event returns as soon as Lambda accepts the job. The body is included when AWS sends one
  // (a synchronous invoke, or a bad_input the caller captured). An empty body is not success.
  const result = await lambda.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: "Event",
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  );
  return {
    statusCode: result.StatusCode || 0,
    functionError: result.FunctionError,
    payload: decodePayload(result.Payload),
  };
}

async function presignPdf(bucket: string, key: string, downloadName: string) {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentType: "application/pdf",
      ResponseContentDisposition: `attachment; filename="${downloadName}"`,
    }),
    { expiresIn: DOWNLOAD_SECONDS },
  );
}

function decodePayload(payload: Uint8Array | undefined) {
  if (!payload || payload.length === 0) return null;
  try {
    const text = Buffer.from(payload).toString("utf8").trim();
    if (!text) return null;
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function readBody(body: { transformToString?: () => Promise<string> } | undefined) {
  if (!body?.transformToString) return "";
  return body.transformToString();
}

function isMissingObject(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: string }).name;
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
  return status === 404 || name === "NoSuchKey" || name === "NotFound";
}

function isConditionalCheck(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { name?: string }).name === "ConditionalCheckFailedException");
}

function isConditionalFailure(error: unknown) {
  if (error instanceof TransactionCanceledException) return true;
  return Boolean(error && typeof error === "object" && (error as { name?: string }).name === "TransactionCanceledException");
}
