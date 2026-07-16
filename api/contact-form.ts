import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});

interface ContactBody {
  name: string;
  email: string;
  message: string;
}

function validate(body: unknown): body is ContactBody {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.name === "string" && b.name.trim().length > 0 &&
    typeof b.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email) &&
    typeof b.message === "string" && b.message.trim().length > 0
  );
}

export async function handler(event: { body?: string; httpMethod?: string }) {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" },
      body: "",
    };
  }

  let body: unknown;
  try { body = JSON.parse(event.body || "{}"); } catch {
    return { statusCode: 400, headers: cors(), body: JSON.stringify({ error: "Invalid JSON" }) };
  }

  if (!validate(body)) {
    return { statusCode: 422, headers: cors(), body: JSON.stringify({ error: "name, email, and message are required" }) };
  }

  const now = new Date().toISOString();

  try {
    await db.send(new PutCommand({
      TableName: process.env.TABLE_NAME!,
      Item: {
        PK: `CONTACT#${now}`,
        SK: `META#${now}`,
        name: body.name.trim(),
        email: body.email.trim(),
        message: body.message.trim(),
        createdAt: now,
      },
    }));

    await ses.send(new SendEmailCommand({
      Source: process.env.RECIPIENT_EMAIL!,
      Destination: { ToAddresses: [process.env.RECIPIENT_EMAIL!] },
      Message: {
        Subject: { Data: `New enquiry from ${body.name} — First Light Marketing` },
        Body: { Text: { Data: `Name: ${body.name}\nEmail: ${body.email}\n\nMessage:\n${body.message}\n\n— Sent via firstlightmarketing.co.uk` } },
      },
    }));

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({ success: true, message: "Thanks! I'll be in touch soon." }),
    };
  } catch (err) {
    console.error("Contact error:", err);
    return { statusCode: 500, headers: cors(), body: JSON.stringify({ error: "Something went wrong. Please email me directly." }) };
  }
}

function cors() {
  return { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
}
