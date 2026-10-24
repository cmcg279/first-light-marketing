import { DynamoDBClient, TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  TransactWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  PRESENCE_RUN_PREFIX,
  PRESENCE_SPEND_PK,
  PresenceError,
  type PresenceRun,
  type PresenceSocials,
  type PresenceStore,
  type SpendReservation,
  SOCIAL_KEYS,
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
    monthSpendPence: (month) => monthSpendPence(tableName, month),
    insertRun: (run, reservation) => writeRun(tableName, run, reservation, false),
    saveRun: (run, reservation) => writeRun(tableName, run, reservation, true),
    writeObject: (key, body) => writeObject(bucket, key, body),
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
    const result = await db.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: "begins_with(PK, :pk)",
        ExpressionAttributeValues: { ":pk": PRESENCE_RUN_PREFIX },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );
    items.push(...((result.Items || []) as Record<string, unknown>[]));
    exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return items.map(itemToRun).filter((run): run is PresenceRun => Boolean(run));
}

async function getRun(tableName: string, id: string) {
  const result = await db.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: `${PRESENCE_RUN_PREFIX}${id}`, SK: "META" },
    }),
  );
  return result.Item ? itemToRun(result.Item) : null;
}

async function monthSpendPence(tableName: string, month: string) {
  const result = await db.send(
    new GetCommand({
      TableName: tableName,
      Key: { PK: PRESENCE_SPEND_PK, SK: `MONTH#${month}` },
    }),
  );
  const amount = result.Item?.amountPence;
  return typeof amount === "number" && Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
}

async function writeRun(
  tableName: string,
  run: PresenceRun,
  reservation: SpendReservation | null,
  overwrite: boolean,
) {
  const runWrite = overwrite
    ? {
        Put: {
          TableName: tableName,
          Item: runToItem(run),
          ConditionExpression: "attribute_exists(PK)",
        },
      }
    : {
        Put: {
          TableName: tableName,
          Item: runToItem(run),
          ConditionExpression: "attribute_not_exists(PK)",
        },
      };
  const spendWrite = reservation && reservation.deltaPence !== 0 ? spendChange(tableName, reservation) : undefined;

  try {
    await db.send(
      new TransactWriteCommand({
        TransactItems: spendWrite ? [runWrite, spendWrite] : [runWrite],
      }),
    );
  } catch (error) {
    if (reservation?.mode === "reserve" && isConditionalFailure(error)) {
      throw new PresenceError(409, "Monthly cap reached.");
    }
    if (reservation && reservation.mode !== "reserve" && isConditionalFailure(error)) {
      console.error("Presence spend update was skipped.");
      await db.send(
        new PutCommand({
          TableName: tableName,
          Item: runToItem(run),
          ConditionExpression: "attribute_exists(PK)",
        }),
      );
      return;
    }
    throw error;
  }
}

function spendChange(tableName: string, reservation: SpendReservation) {
  const values: Record<string, unknown> = { ":delta": reservation.deltaPence };
  let update = "ADD amountPence :delta";
  let condition = "attribute_exists(PK)";

  if (reservation.mode === "reserve") {
    update =
      "ADD amountPence :delta, runCount :one SET entityType = if_not_exists(entityType, :entity), monthKey = if_not_exists(monthKey, :month)";
    values[":one"] = 1;
    values[":entity"] = "PRESENCE_SPEND";
    values[":month"] = reservation.month;
    values[":maxBefore"] = reservation.capPence - reservation.deltaPence;
    condition = "attribute_not_exists(amountPence) OR amountPence <= :maxBefore";
  } else if (reservation.deltaPence < 0) {
    update = "ADD amountPence :delta, runCount :zero";
    values[":zero"] = 0;
    values[":need"] = -reservation.deltaPence;
    condition = "attribute_exists(amountPence) AND amountPence >= :need";
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

async function writeObject(bucket: string, key: string, body: unknown) {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(body),
      ContentType: "application/json",
      ServerSideEncryption: "AES256",
    }),
  );
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
  if (!functionName) {
    throw new PresenceError(503, "The audit worker is not deployed on this stack yet.");
  }

  const result = await lambda.send(
    new InvokeCommand({
      FunctionName: functionName,
      InvocationType: "Event",
      Payload: Buffer.from(JSON.stringify(payload)),
    }),
  );

  if (result.StatusCode !== 202 && result.StatusCode !== 200) {
    throw new PresenceError(502, "The audit worker could not be started.");
  }
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

function runToItem(run: PresenceRun) {
  return stripUndefined({
    PK: `${PRESENCE_RUN_PREFIX}${run.id}`,
    SK: "META",
    entityType: "PRESENCE_RUN",
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
    s3Prefix: run.s3Prefix,
    pdfKey: run.pdfKey,
    errorMessage: run.errorMessage,
    reservedPence: run.reservedPence,
    costSource: run.costSource,
    attempts: run.attempts,
    month: run.month,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt,
  });
}

function itemToRun(item: Record<string, unknown>): PresenceRun | null {
  const id = typeof item.id === "string" ? item.id : "";
  if (!id) return null;
  const socials = emptySocials();
  const rawSocials = item.socials;
  if (rawSocials && typeof rawSocials === "object") {
    for (const key of SOCIAL_KEYS) {
      const value = (rawSocials as Record<string, unknown>)[key];
      socials[key] = typeof value === "string" ? value : "";
    }
  }

  const status = ["queued", "running", "completed", "failed", "cancelled"].includes(String(item.status))
    ? (String(item.status) as PresenceRun["status"])
    : "queued";
  const costSource = ["test", "estimate", "worker", "released"].includes(String(item.costSource))
    ? (String(item.costSource) as PresenceRun["costSource"])
    : "estimate";

  return {
    id,
    businessName: text(item.businessName),
    website: text(item.website),
    socials,
    location: text(item.location),
    notes: text(item.notes),
    testMode: Boolean(item.testMode),
    pageLimit: typeof item.pageLimit === "number" ? item.pageLimit : 35,
    status,
    progress: typeof item.progress === "number" ? item.progress : 0,
    statusMessage: text(item.statusMessage),
    fileName: text(item.fileName) || "presence-audit.pdf",
    s3Prefix: text(item.s3Prefix) || `runs/${id}/`,
    pdfKey: typeof item.pdfKey === "string" ? item.pdfKey : undefined,
    errorMessage: typeof item.errorMessage === "string" ? item.errorMessage : undefined,
    reservedPence: typeof item.reservedPence === "number" ? item.reservedPence : 0,
    costSource,
    attempts: typeof item.attempts === "number" ? item.attempts : 1,
    month: text(item.month),
    createdAt: text(item.createdAt),
    updatedAt: text(item.updatedAt),
    completedAt: typeof item.completedAt === "string" ? item.completedAt : undefined,
  };
}

function emptySocials(): PresenceSocials {
  return { instagram: "", facebook: "", tiktok: "", linkedin: "", youtube: "", x: "" };
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stripUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
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

function isConditionalFailure(error: unknown) {
  if (error instanceof TransactionCanceledException) return true;
  return Boolean(error && typeof error === "object" && (error as { name?: string }).name === "TransactionCanceledException");
}
