import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ses = new SESClient({});
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

interface LeadBody {
  servicesNeeded: string[];
  challenge: string;
  challengeOther?: string;
  budgetRange: string;
  name: string;
  email: string;
  phone?: string;
  business?: string;
  comments?: string;
}

interface LambdaFunctionUrlEvent {
  body?: string;
  httpMethod?: string;
  requestContext?: {
    http?: {
      method?: string;
    };
  };
}

interface ContactEmailTemplate {
  subject: string;
  body: string;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const defaultContactEmailTemplate: ContactEmailTemplate = {
  subject: "New enquiry from {{name}} - First Light Marketing",
  body: [
    "A new enquiry has come through the First Light Marketing website.",
    "",
    "Lead details",
    "Name: {{name}}",
    "Business: {{business}}",
    "Email: {{email}}",
    "Phone: {{phone}}",
    "",
    "What they need",
    "Services: {{servicesNeeded}}",
    "Biggest challenge: {{challenge}}",
    "Budget: {{budgetRange}}",
    "",
    "Message",
    "{{comments}}",
    "",
    "Submitted: {{createdAt}}",
    "",
    "Reply directly to this email to start the conversation.",
  ].join("\n"),
};

function validate(body: unknown): body is LeadBody {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;

  return (
    Array.isArray(b.servicesNeeded) &&
    b.servicesNeeded.length > 0 &&
    b.servicesNeeded.every((service) => typeof service === "string" && service.trim().length > 0) &&
    typeof b.challenge === "string" &&
    b.challenge.trim().length > 0 &&
    typeof b.budgetRange === "string" &&
    b.budgetRange.trim().length > 0 &&
    typeof b.name === "string" &&
    b.name.trim().length > 0 &&
    typeof b.email === "string" &&
    emailPattern.test(b.email.trim()) &&
    optionalString(b.challengeOther) &&
    optionalString(b.phone) &&
    optionalString(b.business) &&
    optionalString(b.comments)
  );
}

function optionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

export async function handler(event: LambdaFunctionUrlEvent) {
  const method = event.requestContext?.http?.method || event.httpMethod;

  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: cors(),
      body: "",
    };
  }

  if (method && method !== "POST") {
    return {
      statusCode: 405,
      headers: cors(),
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  let body: unknown;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: cors(),
      body: JSON.stringify({ error: "Invalid JSON" }),
    };
  }

  if (!validate(body)) {
    return {
      statusCode: 422,
      headers: cors(),
      body: JSON.stringify({ error: "Please complete the required form fields." }),
    };
  }

  const now = new Date().toISOString();
  const lead = normalizeLead(body);

  try {
    await db.send(
      new PutCommand({
        TableName: process.env.TABLE_NAME!,
        Item: {
          PK: `CONTACT#${now}`,
          SK: `META#${now}`,
          ...lead,
          createdAt: now,
          responded: false,
        },
      }),
    );

    let emailSent = false;
    if (process.env.EMAIL_ENABLED === "false") {
      console.info("Contact email is disabled for this stage. The lead was saved.");
    } else {
      try {
        const template = await getContactEmailTemplate();
        const variables = emailVariables(lead, now);
        const subject = renderTemplate(template.subject, variables);
        const textBody = renderTemplate(template.body, variables);

        await ses.send(
          new SendEmailCommand({
            Source: process.env.RECIPIENT_EMAIL!,
            Destination: { ToAddresses: [process.env.RECIPIENT_EMAIL!] },
            ReplyToAddresses: [lead.email],
            Message: {
              Subject: { Data: subject },
              Body: {
                Text: {
                  Data: textBody,
                },
                Html: {
                  Data: formatBrandedEmailHtml(subject, textBody, variables),
                },
              },
            },
          }),
        );
        emailSent = true;
      } catch (emailError) {
        console.error("Lead saved but email failed:", emailError);
      }
    }

    return {
      statusCode: 200,
      headers: cors(),
      body: JSON.stringify({
        success: true,
        leadSaved: true,
        emailSent,
        leadId: `CONTACT#${now}`,
        message: "Thanks! Niamh will be in touch soon.",
      }),
    };
  } catch (err) {
    console.error("Contact error:", err);
    return {
      statusCode: 500,
      headers: cors(),
      body: JSON.stringify({ error: "Something went wrong. Please email Niamh directly." }),
    };
  }
}

function normalizeLead(body: LeadBody): LeadBody {
  return {
    servicesNeeded: body.servicesNeeded.map((service) => service.trim()),
    challenge: body.challenge.trim(),
    challengeOther: body.challengeOther?.trim() || undefined,
    budgetRange: body.budgetRange.trim(),
    name: body.name.trim(),
    email: body.email.trim().toLowerCase(),
    phone: body.phone?.trim() || undefined,
    business: body.business?.trim() || undefined,
    comments: body.comments?.trim() || undefined,
  };
}

async function getContactEmailTemplate(): Promise<ContactEmailTemplate> {
  const result = await db.send(
    new GetCommand({
      TableName: process.env.TABLE_NAME!,
      Key: { PK: "CONTENT#SITE", SK: "CURRENT" },
    }),
  );

  const template = result.Item?.content?.emailTemplates?.contactNotification;

  return {
    subject:
      typeof template?.subject === "string" && template.subject.trim()
        ? template.subject.trim()
        : defaultContactEmailTemplate.subject,
    body:
      typeof template?.body === "string" && template.body.trim()
        ? template.body.trim()
        : defaultContactEmailTemplate.body,
  };
}

function emailVariables(lead: LeadBody, createdAt: string) {
  const challenge =
    lead.challenge === "Other" && lead.challengeOther
      ? `${lead.challenge}: ${lead.challengeOther}`
      : lead.challenge;

  return {
    servicesNeeded: lead.servicesNeeded.join(", "),
    challenge,
    challengeOther: lead.challengeOther || "Not provided",
    budgetRange: lead.budgetRange,
    name: lead.name,
    email: lead.email,
    phone: lead.phone || "Not provided",
    business: lead.business || "Not provided",
    comments: lead.comments || "Not provided",
    createdAt,
  };
}

function renderTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    return variables[key] ?? "";
  });
}

function formatBrandedEmailHtml(subject: string, textBody: string, variables: Record<string, string>) {
  const paragraphs = textBody
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="margin:0 0 18px;line-height:1.65;">${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");

  return `<!doctype html>
<html>
  <body style="margin:0;background:#f8f3ec;font-family:Arial,sans-serif;color:#2f2a26;">
    <div style="padding:32px 16px;">
      <div style="max-width:640px;margin:0 auto;background:#fffaf4;border:1px solid rgba(47,42,38,0.12);">
        <div style="background:#d96f55;padding:28px 30px;color:#fffaf4;">
          <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;opacity:0.82;">First Light Marketing</div>
          <h1 style="margin:10px 0 0;font-family:Georgia,serif;font-size:30px;line-height:1.15;">New enquiry</h1>
        </div>
        <div style="padding:30px;">
          <div style="font-size:12px;letter-spacing:0.16em;text-transform:uppercase;font-weight:700;color:#d96f55;margin-bottom:10px;">${escapeHtml(variables.name)}</div>
          <h2 style="margin:0 0 20px;font-family:Georgia,serif;font-size:24px;line-height:1.2;color:#2f2a26;">${escapeHtml(subject)}</h2>
          <div style="font-size:15px;color:#4f4740;">${paragraphs}</div>
          <div style="margin-top:26px;padding-top:20px;border-top:1px solid rgba(47,42,38,0.12);font-size:13px;color:#6d6258;">
            Reply to this email to contact ${escapeHtml(variables.name)} directly.
          </div>
        </div>
      </div>
    </div>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cors() {
  return {
    "Access-Control-Allow-Origin": allowedOrigins[0] || "https://firstlightmarketing.co.uk",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, x-amz-content-sha256",
    "Content-Type": "application/json",
  };
}
