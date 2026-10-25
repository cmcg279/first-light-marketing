import { randomUUID, timingSafeEqual } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PutSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { XMLParser } from "fast-xml-parser";
import { createAwsPresenceStore } from "./presence-audit-aws";
import { handlePresenceRequest, isPresenceAdminRoute, loadPresenceConfig, PresenceError } from "./presence-audit";

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const s3 = new S3Client({});
const secrets = new SecretsManagerClient({});
const ssm = new SSMClient({});
let cachedCognitoClientId: string | undefined;
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const cognitoIssuer = process.env.COGNITO_USER_POOL_ID
  ? `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`
  : "";
interface CognitoJwk extends JsonWebKey {
  kid?: string;
}

let jwksCache: { keys: CognitoJwk[]; expiresAt: number } | undefined;
const rssParser = new XMLParser({
  attributeNamePrefix: "",
  ignoreAttributes: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

interface LambdaFunctionUrlEvent {
  body?: string;
  headers?: Record<string, string | undefined>;
  rawPath?: string;
  httpMethod?: string;
  requestContext?: {
    http?: {
      method?: string;
      path?: string;
    };
  };
}

interface SiteContent {
  home: {
    heroHeading: string;
    heroButtonLabel: string;
    capabilityStrip: string;
    firstLightQuote: string;
    introParagraphs: string[];
    contactEyebrow: string;
    contactTitle: string;
    contactBody: string;
  };
  services: {
    heroHeading: string;
    heroSubheading: string;
    introEyebrow: string;
    introHeading: string;
    introBody: string;
    workTogetherEyebrow: string;
    workTogetherHeading: string;
    workTogetherBody: string;
    ctaHeading: string;
    ctaBody: string;
    ctaButtonLabel: string;
  };
  work: {
    heroHeading: string;
    heroSubheading: string;
    introEyebrow: string;
    introBody: string;
    ctaHeading: string;
    ctaButtonLabel: string;
  };
  about: {
    heroHeading: string;
    heroSubheading: string;
    sectionHeading: string;
    paragraphs: string[];
    educationLabel: string;
    educationText: string;
    experienceLabel: string;
    experienceText: string;
  };
  approach: {
    heroHeading: string;
    heroSubheading: string;
    closing: string;
    ctaHeading: string;
    ctaBody: string;
    ctaButtonLabel: string;
  };
  contact: {
    eyebrow: string;
    heading: string;
    body: string;
    formEyebrow: string;
    formHeading: string;
    emailTitle: string;
    emailDescription: string;
    tiktokTitle: string;
    tiktokDescription: string;
  };
  announcement: {
    enabled: boolean;
    eyebrow: string;
    title: string;
    body: string;
    buttonLabel: string;
    buttonHref: string;
  };
  emailTemplates: {
    contactNotification: {
      subject: string;
      body: string;
    };
    substackFooter: {
      heading: string;
      body: string;
      buttonLabel: string;
      buttonHref: string;
      signoff: string;
    };
  };
  settings: {
    blogEnabled: boolean;
    substackUrl: string;
  };
}

interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  coverImage: string;
  coverAlt: string;
  body: string;
  bodyHtml?: string;
  externalUrl?: string;
  source?: "local" | "substack";
  status: "draft" | "published";
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface MediaAsset {
  id: string;
  key: string;
  url: string;
  fileName: string;
  contentType: string;
  createdAt: string;
}

interface AuditSettings {
  recommendationsEnabled: boolean;
  aiEnabled: boolean;
  instagramUsername: string;
  instagramLoginUsername: string;
  defaultPostLimit: number;
  hasDeepseekKey: boolean;
  updatedAt?: string;
}

interface AuditReport {
  id: string;
  handle: string;
  postLimit: number;
  recommendationsEnabled: boolean;
  aiEnabled: boolean;
  status: "queued" | "running" | "completed" | "failed";
  fileName: string;
  s3Key?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

const defaultAuditSettings: AuditSettings = {
  recommendationsEnabled: true,
  aiEnabled: false,
  instagramUsername: "",
  instagramLoginUsername: "",
  defaultPostLimit: 30,
  hasDeepseekKey: false,
};

const defaultContent: SiteContent = {
  home: {
    heroHeading: "Bringing clarity to your marketing.",
    heroButtonLabel: "See how I can help",
    capabilityStrip: "Strategy • Content • Campaigns • Marketing Support",
    firstLightQuote:
      "First light is the moment the first rays of sunlight appear on the horizon, signalling the start of a new day. It’s a time of clarity, fresh perspective and new possibilities.",
    introParagraphs: [
      "That’s the approach I bring to every business I work with. Whether you’re starting from scratch, refreshing your brand or ready to grow, every successful marketing journey begins with a clear direction.",
      "My role is to help uncover opportunities, build meaningful strategies and create Bringing clarity to your marketing.",
      "Backed by a degree in Communications, Advertising & Marketing and a decade of experience, I have got to work with some pretty cool brands:",
    ],
    contactEyebrow: "Get in touch",
    contactTitle: "I’m ready when you are",
    contactBody: "Every project starts with a conversation, no pressure, no obligation.",
  },
  services: {
    heroHeading: "How we can work together",
    heroSubheading: "Flexible marketing support for businesses that need clarity, consistency and campaigns that move.",
    introEyebrow: "Services",
    introHeading: "Marketing support shaped around what your business actually needs.",
    introBody:
      "Whether you need strategic direction, content creation, launch support or a flexible marketing partner, Niamh can step in where the pressure is highest and help the full picture work together.",
    workTogetherEyebrow: "Ways to work together",
    workTogetherHeading: "One-off project or ongoing partner, the setup can flex.",
    workTogetherBody: "Every business is different, so support is tailored to your goals, your team and your budget.",
    ctaHeading: "Not sure what support you need yet?",
    ctaBody:
      "Start with a conversation. Niamh can help you work out whether you need strategy, content, a campaign plan or ongoing marketing support.",
    ctaButtonLabel: "Get in touch",
  },
  work: {
    heroHeading: "Turning First Light into lasting results",
    heroSubheading: "Every campaign begins with a clear strategy. Explore a selection of the campaigns, launches and marketing projects that have shaped my experience and delivered measurable results.",
    introEyebrow: "Work",
    introBody:
      "Every campaign begins with a clear strategy. Explore a selection of the campaigns, launches and marketing projects that have shaped my experience and delivered measurable results.",
    ctaHeading: "Want marketing support with a clearer plan behind it?",
    ctaButtonLabel: "Start a project",
  },
  about: {
    heroHeading: "Why First Light?",
    heroSubheading: "Clarity. Fresh perspective. New possibilities.",
    sectionHeading: "A strategic partner for your business",
    paragraphs: [
      "That's the approach I bring to every business I work with. Whether you're starting from scratch, refreshing your brand or ready to grow, every successful marketing journey begins with a clear direction.",
      "My role is to help uncover opportunities, build meaningful strategies and create Bringing clarity to your marketing.",
      "Backed by a degree in Communications, Advertising & Marketing and almost a decade of experience, I've had the privilege of working with some pretty cool brands along the way.",
    ],
    educationLabel: "Education",
    educationText: "Degree in Communications, Advertising & Marketing",
    experienceLabel: "Experience",
    experienceText: "A decade of marketing experience",
  },
  approach: {
    heroHeading: "How I work",
    heroSubheading:
      "Like the first light of a new day, every customer journey begins with discovery. Strategic marketing nurtures that journey into trust, action and lasting loyalty.",
    closing:
      "With experience across every stage of the customer journey, I create marketing that doesn't just look good, it delivers results.",
    ctaHeading: "Ready to find your first light?",
    ctaBody: "Every successful marketing journey begins with a clear direction. Let's find yours.",
    ctaButtonLabel: "Let's talk",
  },
  contact: {
    eyebrow: "Contact",
    heading: "Let’s talk about your marketing.",
    body: "Tell Niamh what you need help with and she’ll come back with the best next step. No pressure, no obligation.",
    formEyebrow: "Start here",
    formHeading: "Tell me what you need help with.",
    emailTitle: "Prefer to email directly?",
    emailDescription: "Send a note any time. Niamh aims to respond within 24 hours.",
    tiktokTitle: "See what she creates",
    tiktokDescription: "Local content, behind-the-scenes clips and a feel for her style.",
  },
  announcement: {
    enabled: false,
    eyebrow: "Now booking",
    title: "Need marketing support this month?",
    body: "Add a short, timely update here from the admin portal. Use it for launch availability, seasonal campaigns or a featured service.",
    buttonLabel: "Get in touch",
    buttonHref: "/contact",
  },
  emailTemplates: {
    contactNotification: {
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
    },
    substackFooter: {
      heading: "Ready to bring clarity to your marketing?",
      body: "If you’re planning a launch, struggling to stay consistent, or need experienced marketing support without hiring full-time, I’d love to hear what you’re working on.",
      buttonLabel: "Book a chat",
      buttonHref: "https://firstlightmarketing.co.uk/contact",
      signoff: "Niamh\nFirst Light Marketing",
    },
  },
  settings: {
    blogEnabled: false,
    substackUrl: "",
  },
};

export async function handler(event: LambdaFunctionUrlEvent) {
  const method = event.requestContext?.http?.method || event.httpMethod || "GET";
  const path = normalizePath(event.requestContext?.http?.path || event.rawPath || "");

  if (method === "OPTIONS") {
    return response(204, "");
  }

  try {
    if (method === "GET" && path === "/api/content") {
      return response(200, await getContent());
    }

    if (method === "GET" && path === "/api/blog") {
      return response(200, { posts: await listBlogPosts("published") });
    }

    if (method === "GET" && path.startsWith("/api/blog/")) {
      const slug = path.replace("/api/blog/", "");
      return response(200, { post: await getPublicBlogPost(slug) });
    }

    if (method === "GET" && path === "/api/auth/config") {
      const browserOrigin = resolveBrowserOrigin(event);
      return response(200, {
        cognitoDomain: process.env.COGNITO_DOMAIN || "",
        clientId: await getExpectedClientId(),
        redirectUri: browserOrigin ? `${browserOrigin}/admin` : process.env.COGNITO_REDIRECT_URI || "",
        logoutUri: browserOrigin ? `${browserOrigin}/admin` : process.env.COGNITO_LOGOUT_URI || "",
      });
    }

    if (method === "GET" && path === "/api/runner/audit/reports/queued") {
      requireRunnerAuth(event);
      return response(200, { reports: await listQueuedAuditReports() });
    }

    if (method === "POST" && path === "/api/runner/audit/reports/start") {
      requireRunnerAuth(event);
      return startAuditReport(event.body);
    }

    if (method === "POST" && path === "/api/runner/audit/reports/upload") {
      requireRunnerAuth(event);
      return createAuditReportUpload(event.body);
    }

    if (method === "POST" && path === "/api/runner/audit/reports/complete-upload") {
      requireRunnerAuth(event);
      return completeAuditReportUpload(event.body);
    }

    if (method === "POST" && path === "/api/runner/audit/reports/fail") {
      requireRunnerAuth(event);
      return failAuditReport(event.body);
    }

    if (path === "/api/admin/leads" && method === "GET") {
      await requireAuth(event);
      return response(200, { leads: await listLeads() });
    }

    if (path === "/api/admin/leads" && method === "PATCH") {
      await requireAuth(event);
      return updateLead(event.body);
    }

    if (path === "/api/admin/leads" && method === "DELETE") {
      await requireAuth(event);
      return deleteLead(event.body);
    }

    if (path === "/api/admin/content" && method === "GET") {
      await requireAuth(event);
      return response(200, await getContent());
    }

    if (path === "/api/admin/content" && method === "PUT") {
      await requireAuth(event);
      return saveContent(event.body);
    }

    if (path === "/api/admin/uploads" && method === "POST") {
      await requireAuth(event);
      return createUpload(event.body);
    }

    if (path === "/api/admin/media" && method === "GET") {
      await requireAuth(event);
      return response(200, { assets: await listMediaAssets() });
    }

    if (path === "/api/admin/audit/settings" && method === "GET") {
      await requireAuth(event);
      return response(200, await getAuditSettings());
    }

    if (path === "/api/admin/audit/settings" && method === "PUT") {
      await requireAuth(event);
      return saveAuditSettings(event.body);
    }

    if (path === "/api/admin/audit/reports" && method === "GET") {
      await requireAuth(event);
      return response(200, { reports: await listAuditReports() });
    }

    if (path === "/api/admin/audit/reports" && method === "POST") {
      await requireAuth(event);
      return createAuditReport(event.body);
    }

    if (path === "/api/admin/audit/reports" && method === "DELETE") {
      await requireAuth(event);
      return deleteAuditReport(event.body);
    }

    if (path === "/api/admin/audit/reports/download" && method === "POST") {
      await requireAuth(event);
      return createAuditReportDownload(event.body);
    }

    if (path === "/api/admin/audit/reports/upload" && method === "POST") {
      await requireAuth(event);
      return createAuditReportUpload(event.body);
    }

    if (path === "/api/admin/audit/reports/complete-upload" && method === "POST") {
      await requireAuth(event);
      return completeAuditReportUpload(event.body);
    }

    if (isPresenceAdminRoute(method, path)) {
      const result = await handlePresenceRequest({
        method,
        path,
        body: event.body,
        config: loadPresenceConfig(process.env),
        authorize: () => presenceRequestedBy(event),
        store: createAwsPresenceStore(),
      });
      return response(result.statusCode, result.body);
    }

    if (path === "/api/admin/blog" && method === "GET") {
      await requireAuth(event);
      return response(200, { posts: await listBlogPosts("all") });
    }

    if (path === "/api/admin/blog" && method === "PUT") {
      await requireAuth(event);
      return saveBlogPost(event.body);
    }

    if (path === "/api/admin/blog" && method === "DELETE") {
      await requireAuth(event);
      return deleteBlogPost(event.body);
    }

    return response(404, { error: "Not found" });
  } catch (error) {
    if (error instanceof AuthError || error instanceof PresenceError) {
      return response(error.statusCode, { error: error.message });
    }

    console.error("Admin API error:", error);
    return response(500, { error: "Something went wrong." });
  }
}

async function listLeads() {
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await db.send(
      new ScanCommand({
        TableName: process.env.TABLE_NAME!,
        FilterExpression: "begins_with(PK, :pk)",
        ExpressionAttributeValues: { ":pk": "CONTACT#" },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    items.push(...((result.Items || []) as Record<string, unknown>[]));
    exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return items
    .map(serializeLead)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function serializeLead(item: Record<string, unknown>) {
  return {
    id: item.PK,
    createdAt: item.createdAt,
    name: item.name,
    email: item.email,
    phone: item.phone,
    business: item.business,
    servicesNeeded: item.servicesNeeded || [],
    challenge: item.challenge,
    challengeOther: item.challengeOther,
    budgetRange: item.budgetRange,
    comments: item.comments,
    responded: Boolean(item.responded),
    respondedAt: item.respondedAt,
  };
}

async function updateLead(rawBody?: string) {
  const body = parseJson(rawBody);
  const id = requiredLeadId(body.id);
  const responded = Boolean(body.responded);
  const now = new Date().toISOString();

  const result = await db.send(
    new UpdateCommand({
      TableName: process.env.TABLE_NAME!,
      Key: { PK: id, SK: id.replace("CONTACT#", "META#") },
      ConditionExpression: "attribute_exists(PK)",
      UpdateExpression: responded
        ? "SET responded = :responded, respondedAt = :respondedAt"
        : "SET responded = :responded REMOVE respondedAt",
      ExpressionAttributeValues: responded
        ? { ":responded": true, ":respondedAt": now }
        : { ":responded": false },
      ReturnValues: "ALL_NEW",
    }),
  );

  return response(200, { lead: serializeLead(result.Attributes || {}) });
}

async function deleteLead(rawBody?: string) {
  const body = parseJson(rawBody);
  const id = requiredLeadId(body.id);

  await db.send(
    new DeleteCommand({
      TableName: process.env.TABLE_NAME!,
      Key: { PK: id, SK: id.replace("CONTACT#", "META#") },
      ConditionExpression: "attribute_exists(PK)",
    }),
  );

  return response(200, { success: true });
}

function requiredLeadId(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("CONTACT#")) {
    throw new AuthError(422, "Valid lead id is required.");
  }

  return value;
}

async function getContent() {
  const result = await db.send(
    new GetCommand({
      TableName: process.env.TABLE_NAME!,
      Key: { PK: "CONTENT#SITE", SK: "CURRENT" },
    }),
  );

  return {
    ...defaultContent,
    ...(result.Item?.content || {}),
    home: {
      ...defaultContent.home,
      ...(result.Item?.content?.home || {}),
      introParagraphs: Array.isArray(result.Item?.content?.home?.introParagraphs)
        ? result.Item.content.home.introParagraphs
        : defaultContent.home.introParagraphs,
    },
    services: {
      ...defaultContent.services,
      ...(result.Item?.content?.services || {}),
    },
    work: upgradeWorkContent({
      ...defaultContent.work,
      ...(result.Item?.content?.work || {}),
    }),
    about: {
      ...defaultContent.about,
      ...(result.Item?.content?.about || {}),
      paragraphs: Array.isArray(result.Item?.content?.about?.paragraphs)
        ? result.Item.content.about.paragraphs
        : defaultContent.about.paragraphs,
    },
    approach: {
      ...defaultContent.approach,
      ...(result.Item?.content?.approach || {}),
    },
    contact: {
      ...defaultContent.contact,
      ...(result.Item?.content?.contact || {}),
    },
    announcement: {
      ...defaultContent.announcement,
      ...(result.Item?.content?.announcement || {}),
    },
    emailTemplates: {
      contactNotification: {
        ...defaultContent.emailTemplates.contactNotification,
        ...(result.Item?.content?.emailTemplates?.contactNotification || {}),
      },
      substackFooter: {
        ...defaultContent.emailTemplates.substackFooter,
        ...(result.Item?.content?.emailTemplates?.substackFooter || {}),
      },
    },
    settings: {
      ...defaultContent.settings,
      ...(result.Item?.content?.settings || {}),
    },
  };
}

function upgradeWorkContent(work: SiteContent["work"]): SiteContent["work"] {
  return {
    ...work,
    heroHeading:
      work.heroHeading === "See for yourself" ||
      work.heroHeading === "Marketing work with proof behind it"
        ? defaultContent.work.heroHeading
        : work.heroHeading,
    heroSubheading:
      work.heroSubheading === "Campaigns, content and launch work with measurable outcomes." ||
      work.heroSubheading === "Campaigns, launches and content shaped around clear commercial outcomes."
        ? defaultContent.work.heroSubheading
        : work.heroSubheading,
    introBody:
      work.introBody ===
      "Browse selected campaigns and content projects. Each card keeps the headline proof tight, with the full context available in the case-study view." ||
      work.introBody ===
      "Browse selected campaigns, launches and content projects across ecommerce, hospitality, wellness and UGC."
        ? defaultContent.work.introBody
        : work.introBody,
    ctaHeading:
      work.ctaHeading === "Let's create results like these for your brand"
        ? defaultContent.work.ctaHeading
        : work.ctaHeading,
    ctaButtonLabel:
      work.ctaButtonLabel === "Start a conversation"
        ? defaultContent.work.ctaButtonLabel
        : work.ctaButtonLabel,
  };
}

async function saveContent(rawBody?: string) {
  const content = normalizeContent(parseJson(rawBody));
  const now = new Date().toISOString();

  await db.send(
    new PutCommand({
      TableName: process.env.TABLE_NAME!,
      Item: {
        PK: "CONTENT#SITE",
        SK: "CURRENT",
        content,
        updatedAt: now,
      },
    }),
  );

  return response(200, { ...content, updatedAt: now });
}

async function createUpload(rawBody?: string) {
  const body = parseJson(rawBody);
  const fileName = requiredText(body.fileName, "File name");
  const contentType = requiredText(body.contentType, "Content type").toLowerCase();
  const extension = extensionForContentType(contentType);
  const id = randomUUID();
  const now = new Date().toISOString();
  const key = `media/uploads/${now.slice(0, 7)}/${id}-${slugifyFileName(fileName)}.${extension}`;
  const publicUrl = `/${key}`;

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: process.env.MEDIA_BUCKET_NAME!,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 300 },
  );

  const asset: MediaAsset = {
    id,
    key,
    url: publicUrl,
    fileName,
    contentType,
    createdAt: now,
  };

  await db.send(
    new PutCommand({
      TableName: process.env.TABLE_NAME!,
      Item: {
        PK: `MEDIA#${id}`,
        SK: "META",
        ...asset,
      },
    }),
  );

  return response(200, { uploadUrl, asset });
}

async function listMediaAssets() {
  const result = await db.send(
    new ScanCommand({
      TableName: process.env.TABLE_NAME!,
      FilterExpression: "begins_with(PK, :pk)",
      ExpressionAttributeValues: { ":pk": "MEDIA#" },
      Limit: 100,
    }),
  );

  return (result.Items || [])
    .map(serializeMediaAsset)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function serializeMediaAsset(item: Record<string, unknown>): MediaAsset {
  return {
    id: String(item.id || "").trim(),
    key: String(item.key || "").trim(),
    url: String(item.url || "").trim(),
    fileName: String(item.fileName || "").trim(),
    contentType: String(item.contentType || "").trim(),
    createdAt: String(item.createdAt || "").trim(),
  };
}

async function getAuditSettings(): Promise<AuditSettings> {
  const result = await db.send(
    new GetCommand({
      TableName: process.env.TABLE_NAME!,
      Key: { PK: "AUDIT#SETTINGS", SK: "CURRENT" },
    }),
  );

  return normalizeAuditSettings({
    ...defaultAuditSettings,
    ...(result.Item?.settings || {}),
    hasDeepseekKey: Boolean(result.Item?.settings?.hasDeepseekKey),
    updatedAt: result.Item?.updatedAt,
  });
}

async function saveAuditSettings(rawBody?: string) {
  const body = parseJson(rawBody);
  const current = await getAuditSettings();
  const now = new Date().toISOString();
  const settings = normalizeAuditSettings({
    ...current,
    ...body,
    hasDeepseekKey: current.hasDeepseekKey || Boolean(optionalTrimmed(body.deepseekKey)),
    updatedAt: now,
  });

  const deepseekKey = optionalTrimmed(body.deepseekKey);
  if (deepseekKey) {
    if (!process.env.DEEPSEEK_SECRET_ID) {
      throw new AuthError(500, "DeepSeek secret storage is not configured.");
    }

    await secrets.send(
      new PutSecretValueCommand({
        SecretId: process.env.DEEPSEEK_SECRET_ID,
        SecretString: deepseekKey,
      }),
    );
  }

  await db.send(
    new PutCommand({
      TableName: process.env.TABLE_NAME!,
      Item: {
        PK: "AUDIT#SETTINGS",
        SK: "CURRENT",
        settings,
        updatedAt: now,
      },
    }),
  );

  return response(200, settings);
}

async function listAuditReports() {
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await db.send(
      new ScanCommand({
        TableName: process.env.TABLE_NAME!,
        FilterExpression: "begins_with(PK, :pk)",
        ExpressionAttributeValues: { ":pk": "AUDIT_REPORT#" },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    items.push(...((result.Items || []) as Record<string, unknown>[]));
    exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return items
    .map(serializeAuditReport)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function listQueuedAuditReports() {
  const reports = await listAuditReports();
  return reports
    .filter((report) => report.status === "queued")
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

async function createAuditReport(rawBody?: string) {
  const body = parseJson(rawBody);
  const settings = await getAuditSettings();
  const handle = normalizeInstagramHandle(body.handle || settings.instagramUsername);
  const now = new Date().toISOString();
  const id = randomUUID();
  const postLimit = normalizePostLimit(body.postLimit ?? settings.defaultPostLimit);
  const recommendationsEnabled =
    typeof body.recommendationsEnabled === "boolean"
      ? body.recommendationsEnabled
      : settings.recommendationsEnabled;
  const aiEnabled = Boolean(
    typeof body.aiEnabled === "boolean" ? body.aiEnabled : settings.aiEnabled,
  );
  const report: AuditReport = {
    id,
    handle,
    postLimit,
    recommendationsEnabled,
    aiEnabled,
    status: "queued",
    fileName: `${handle}-instagram-audit-${now.slice(0, 10)}.pdf`,
    createdAt: now,
    updatedAt: now,
  };

  await db.send(
    new PutCommand({
      TableName: process.env.TABLE_NAME!,
      Item: {
        PK: `AUDIT_REPORT#${id}`,
        SK: "META",
        ...report,
      },
    }),
  );

  return response(200, { report });
}

async function startAuditReport(rawBody?: string) {
  const body = parseJson(rawBody);
  const id = requiredAuditReportId(body.id);
  const now = new Date().toISOString();

  const result = await db.send(
    new UpdateCommand({
      TableName: process.env.TABLE_NAME!,
      Key: { PK: `AUDIT_REPORT#${id}`, SK: "META" },
      ConditionExpression: "attribute_exists(PK) AND #status = :queued",
      UpdateExpression: "SET #status = :running, updatedAt = :updatedAt REMOVE errorMessage",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":queued": "queued",
        ":running": "running",
        ":updatedAt": now,
      },
      ReturnValues: "ALL_NEW",
    }),
  );

  return response(200, { report: serializeAuditReport(result.Attributes || {}) });
}

async function failAuditReport(rawBody?: string) {
  const body = parseJson(rawBody);
  const id = requiredAuditReportId(body.id);
  const errorMessage = optionalTrimmed(body.errorMessage).slice(0, 1000) || "Report generation failed.";
  const now = new Date().toISOString();

  const result = await db.send(
    new UpdateCommand({
      TableName: process.env.TABLE_NAME!,
      Key: { PK: `AUDIT_REPORT#${id}`, SK: "META" },
      ConditionExpression: "attribute_exists(PK)",
      UpdateExpression: "SET #status = :failed, errorMessage = :errorMessage, updatedAt = :updatedAt",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":failed": "failed",
        ":errorMessage": errorMessage,
        ":updatedAt": now,
      },
      ReturnValues: "ALL_NEW",
    }),
  );

  return response(200, { report: serializeAuditReport(result.Attributes || {}) });
}

async function deleteAuditReport(rawBody?: string) {
  const body = parseJson(rawBody);
  const id = requiredAuditReportId(body.id);
  const existing = await getAuditReport(id);

  if (!existing) {
    throw new AuthError(404, "Audit report not found.");
  }

  if (existing.s3Key && process.env.AUDIT_REPORTS_BUCKET_NAME) {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: process.env.AUDIT_REPORTS_BUCKET_NAME,
        Key: existing.s3Key,
      }),
    );
  }

  await db.send(
    new DeleteCommand({
      TableName: process.env.TABLE_NAME!,
      Key: { PK: `AUDIT_REPORT#${id}`, SK: "META" },
      ConditionExpression: "attribute_exists(PK)",
    }),
  );

  return response(200, { success: true });
}

async function createAuditReportDownload(rawBody?: string) {
  const body = parseJson(rawBody);
  const id = requiredAuditReportId(body.id);
  const report = await getAuditReport(id);

  if (!report) {
    throw new AuthError(404, "Audit report not found.");
  }

  if (report.status !== "completed" || !report.s3Key) {
    throw new AuthError(409, "The audit report is not ready to download yet.");
  }

  const downloadUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: process.env.AUDIT_REPORTS_BUCKET_NAME!,
      Key: report.s3Key,
      ResponseContentDisposition: `attachment; filename="${report.fileName}"`,
      ResponseContentType: "application/pdf",
    }),
    { expiresIn: 300 },
  );

  return response(200, { downloadUrl });
}

async function createAuditReportUpload(rawBody?: string) {
  const body = parseJson(rawBody);
  const id = requiredAuditReportId(body.id);
  const report = await getAuditReport(id);

  if (!report) {
    throw new AuthError(404, "Audit report not found.");
  }

  const now = new Date().toISOString();
  const s3Key = `audit-reports/${now.slice(0, 7)}/${id}.pdf`;
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: process.env.AUDIT_REPORTS_BUCKET_NAME!,
      Key: s3Key,
      ContentType: "application/pdf",
      ServerSideEncryption: "AES256",
    }),
    { expiresIn: 300 },
  );

  return response(200, { uploadUrl, s3Key });
}

async function completeAuditReportUpload(rawBody?: string) {
  const body = parseJson(rawBody);
  const id = requiredAuditReportId(body.id);
  const s3Key = requiredAuditReportS3Key(body.s3Key, id);
  const now = new Date().toISOString();

  const result = await db.send(
    new UpdateCommand({
      TableName: process.env.TABLE_NAME!,
      Key: { PK: `AUDIT_REPORT#${id}`, SK: "META" },
      ConditionExpression: "attribute_exists(PK)",
      UpdateExpression: (
        "SET #status = :status, s3Key = :s3Key, updatedAt = :updatedAt, completedAt = :completedAt "
        + "REMOVE errorMessage"
      ),
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": "completed",
        ":s3Key": s3Key,
        ":updatedAt": now,
        ":completedAt": now,
      },
      ReturnValues: "ALL_NEW",
    }),
  );

  return response(200, { report: serializeAuditReport(result.Attributes || {}) });
}

function requiredAuditReportS3Key(value: unknown, id: string) {
  if (typeof value !== "string") {
    throw new AuthError(400, "Report file key is required.");
  }

  const s3Key = value.trim();
  if (!s3Key.startsWith("audit-reports/") || !s3Key.endsWith(`/${id}.pdf`)) {
    throw new AuthError(400, "Report file key is invalid.");
  }

  return s3Key;
}

async function getAuditReport(id: string) {
  const result = await db.send(
    new GetCommand({
      TableName: process.env.TABLE_NAME!,
      Key: { PK: `AUDIT_REPORT#${id}`, SK: "META" },
    }),
  );

  return result.Item ? serializeAuditReport(result.Item) : null;
}

function serializeAuditReport(item: Record<string, unknown>): AuditReport {
  const status = ["queued", "running", "completed", "failed"].includes(String(item.status))
    ? (String(item.status) as AuditReport["status"])
    : "queued";

  return {
    id: String(item.id || "").trim(),
    handle: String(item.handle || "").trim(),
    postLimit: normalizePostLimit(item.postLimit),
    recommendationsEnabled: Boolean(item.recommendationsEnabled),
    aiEnabled: Boolean(item.aiEnabled),
    status,
    fileName: String(item.fileName || "").trim(),
    s3Key: typeof item.s3Key === "string" ? item.s3Key : undefined,
    errorMessage: typeof item.errorMessage === "string" ? item.errorMessage : undefined,
    createdAt: String(item.createdAt || "").trim(),
    updatedAt: String(item.updatedAt || "").trim(),
    completedAt: typeof item.completedAt === "string" ? item.completedAt : undefined,
  };
}

function normalizeAuditSettings(value: Record<string, unknown>): AuditSettings {
  return {
    recommendationsEnabled:
      typeof value.recommendationsEnabled === "boolean"
        ? value.recommendationsEnabled
        : defaultAuditSettings.recommendationsEnabled,
    aiEnabled: typeof value.aiEnabled === "boolean" ? value.aiEnabled : defaultAuditSettings.aiEnabled,
    instagramUsername: optionalInstagramHandle(value.instagramUsername),
    instagramLoginUsername: optionalInstagramHandle(value.instagramLoginUsername),
    defaultPostLimit: normalizePostLimit(value.defaultPostLimit),
    hasDeepseekKey: Boolean(value.hasDeepseekKey),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : undefined,
  };
}

function normalizeInstagramHandle(value: unknown) {
  const handle = optionalInstagramHandle(value);

  if (!handle) {
    throw new AuthError(422, "Instagram handle is required.");
  }

  return handle;
}

function optionalInstagramHandle(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "")
    .slice(0, 30);
}

function normalizePostLimit(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return defaultAuditSettings.defaultPostLimit;
  return Math.min(100, Math.max(5, Math.round(numeric)));
}

function requiredAuditReportId(value: unknown) {
  const id = String(value || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new AuthError(422, "Valid audit report id is required.");
  }

  return id;
}

function normalizeContent(body: Record<string, unknown>): SiteContent {
  const home = body.home as Record<string, unknown> | undefined;
  const services = body.services as Record<string, unknown> | undefined;
  const work = body.work as Record<string, unknown> | undefined;
  const about = body.about as Record<string, unknown> | undefined;
  const approach = body.approach as Record<string, unknown> | undefined;
  const contact = body.contact as Record<string, unknown> | undefined;
  const announcement = body.announcement as Record<string, unknown> | undefined;
  const emailTemplates = body.emailTemplates as Record<string, unknown> | undefined;
  const contactNotification = emailTemplates?.contactNotification as Record<string, unknown> | undefined;
  const substackFooter = emailTemplates?.substackFooter as Record<string, unknown> | undefined;
  const settings = body.settings as Record<string, unknown> | undefined;

  if (!home || typeof home !== "object") {
    throw new AuthError(422, "Homepage content is required.");
  }

  if (!announcement || typeof announcement !== "object") {
    throw new AuthError(422, "Announcement content is required.");
  }

  return {
    home: {
      heroHeading: requiredText(home.heroHeading, "Homepage heading"),
      heroButtonLabel: requiredText(home.heroButtonLabel, "Homepage button label"),
      capabilityStrip: requiredText(home.capabilityStrip, "Capability strip"),
      firstLightQuote: requiredText(home.firstLightQuote, "First Light quote"),
      introParagraphs: normalizeParagraphs(home.introParagraphs, "Intro paragraphs"),
      contactEyebrow: requiredText(home.contactEyebrow, "Contact eyebrow"),
      contactTitle: requiredText(home.contactTitle, "Contact title"),
      contactBody: requiredText(home.contactBody, "Contact body"),
    },
    services: {
      heroHeading: requiredText(services?.heroHeading, "Services hero heading"),
      heroSubheading: requiredText(services?.heroSubheading, "Services hero subheading"),
      introEyebrow: requiredText(services?.introEyebrow, "Services intro eyebrow"),
      introHeading: requiredText(services?.introHeading, "Services intro heading"),
      introBody: requiredText(services?.introBody, "Services intro body"),
      workTogetherEyebrow: requiredText(services?.workTogetherEyebrow, "Ways to work eyebrow"),
      workTogetherHeading: requiredText(services?.workTogetherHeading, "Ways to work heading"),
      workTogetherBody: requiredText(services?.workTogetherBody, "Ways to work body"),
      ctaHeading: requiredText(services?.ctaHeading, "Services CTA heading"),
      ctaBody: requiredText(services?.ctaBody, "Services CTA body"),
      ctaButtonLabel: requiredText(services?.ctaButtonLabel, "Services CTA button label"),
    },
    work: {
      heroHeading: requiredText(work?.heroHeading, "Work hero heading"),
      heroSubheading: requiredText(work?.heroSubheading, "Work hero subheading"),
      introEyebrow: requiredText(work?.introEyebrow, "Work intro eyebrow"),
      introBody: requiredText(work?.introBody, "Work intro body"),
      ctaHeading: requiredText(work?.ctaHeading, "Work CTA heading"),
      ctaButtonLabel: requiredText(work?.ctaButtonLabel, "Work CTA button label"),
    },
    about: {
      heroHeading: requiredText(about?.heroHeading, "About hero heading"),
      heroSubheading: requiredText(about?.heroSubheading, "About hero subheading"),
      sectionHeading: requiredText(about?.sectionHeading, "About section heading"),
      paragraphs: normalizeParagraphs(about?.paragraphs, "About paragraphs"),
      educationLabel: requiredText(about?.educationLabel, "Education label"),
      educationText: requiredText(about?.educationText, "Education text"),
      experienceLabel: requiredText(about?.experienceLabel, "Experience label"),
      experienceText: requiredText(about?.experienceText, "Experience text"),
    },
    approach: {
      heroHeading: requiredText(approach?.heroHeading, "Approach hero heading"),
      heroSubheading: requiredText(approach?.heroSubheading, "Approach hero subheading"),
      closing: requiredText(approach?.closing, "Approach closing"),
      ctaHeading: requiredText(approach?.ctaHeading, "Approach CTA heading"),
      ctaBody: requiredText(approach?.ctaBody, "Approach CTA body"),
      ctaButtonLabel: requiredText(approach?.ctaButtonLabel, "Approach CTA button label"),
    },
    contact: {
      eyebrow: requiredText(contact?.eyebrow, "Contact eyebrow"),
      heading: requiredText(contact?.heading, "Contact heading"),
      body: requiredText(contact?.body, "Contact body"),
      formEyebrow: requiredText(contact?.formEyebrow, "Contact form eyebrow"),
      formHeading: requiredText(contact?.formHeading, "Contact form heading"),
      emailTitle: requiredText(contact?.emailTitle, "Contact email title"),
      emailDescription: requiredText(contact?.emailDescription, "Contact email description"),
      tiktokTitle: requiredText(contact?.tiktokTitle, "Contact TikTok title"),
      tiktokDescription: requiredText(contact?.tiktokDescription, "Contact TikTok description"),
    },
    announcement: {
      enabled: Boolean(announcement.enabled),
      eyebrow: requiredText(announcement.eyebrow, "Eyebrow"),
      title: requiredText(announcement.title, "Title"),
      body: requiredText(announcement.body, "Body"),
      buttonLabel: requiredText(announcement.buttonLabel, "Button label"),
      buttonHref: normalizeHref(requiredText(announcement.buttonHref, "Button link")),
    },
    emailTemplates: {
      contactNotification: {
        subject: requiredText(contactNotification?.subject, "Email subject"),
        body: requiredText(contactNotification?.body, "Email body"),
      },
      substackFooter: {
        heading: requiredText(substackFooter?.heading, "Substack footer heading"),
        body: requiredText(substackFooter?.body, "Substack footer body"),
        buttonLabel: requiredText(substackFooter?.buttonLabel, "Substack footer button label"),
        buttonHref: normalizeHref(requiredText(substackFooter?.buttonHref, "Substack footer button link")),
        signoff: requiredText(substackFooter?.signoff, "Substack footer signoff"),
      },
    },
    settings: {
      blogEnabled: Boolean(settings?.blogEnabled),
      substackUrl: normalizeOptionalUrl(settings?.substackUrl, "Substack URL"),
    },
  };
}

async function listBlogPosts(mode: "all" | "published") {
  if (mode === "published") {
    const content = await getContent();
    const substackPosts = await listSubstackPosts(content.settings.substackUrl);

    if (content.settings.substackUrl) {
      return substackPosts;
    }
  }

  const result = await db.send(
    new ScanCommand({
      TableName: process.env.TABLE_NAME!,
      FilterExpression: "begins_with(PK, :pk)",
      ExpressionAttributeValues: { ":pk": "BLOG#" },
      Limit: 100,
    }),
  );

  return (result.Items || [])
    .map(serializeBlogPost)
    .filter((post) => mode === "all" || post.status === "published")
    .sort((a, b) => String(b.publishedAt || b.updatedAt || "").localeCompare(String(a.publishedAt || a.updatedAt || "")));
}

async function getPublicBlogPost(slug: string) {
  const content = await getContent();
  const substackPosts = await listSubstackPosts(content.settings.substackUrl);
  const substackPost = substackPosts.find((post) => post.slug === slug);

  if (substackPost) {
    return substackPost;
  }

  if (content.settings.substackUrl) {
    throw new AuthError(404, "Post not found.");
  }

  const post = await getBlogPost(slug);

  if (!post || post.status !== "published") {
    throw new AuthError(404, "Post not found.");
  }

  return post;
}

async function getBlogPost(slug: string) {
  const normalizedSlug = normalizeSlug(slug);
  const result = await db.send(
    new GetCommand({
      TableName: process.env.TABLE_NAME!,
      Key: { PK: `BLOG#${normalizedSlug}`, SK: "META" },
    }),
  );

  return result.Item ? serializeBlogPost(result.Item) : null;
}

async function saveBlogPost(rawBody?: string) {
  const body = parseJson(rawBody);
  const existing = await getBlogPost(String(body.slug || ""));
  const post = normalizeBlogPost(body, existing || undefined);
  const now = new Date().toISOString();
  const nextPost = {
    ...post,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    publishedAt: post.status === "published" ? post.publishedAt || existing?.publishedAt || now : undefined,
  };

  await db.send(
    new PutCommand({
      TableName: process.env.TABLE_NAME!,
      Item: {
        PK: `BLOG#${nextPost.slug}`,
        SK: "META",
        ...nextPost,
      },
    }),
  );

  return response(200, { post: nextPost });
}

async function deleteBlogPost(rawBody?: string) {
  const body = parseJson(rawBody);
  const slug = normalizeSlug(String(body.slug || ""));

  await db.send(
    new DeleteCommand({
      TableName: process.env.TABLE_NAME!,
      Key: { PK: `BLOG#${slug}`, SK: "META" },
      ConditionExpression: "attribute_exists(PK)",
    }),
  );

  return response(200, { success: true });
}

function normalizeBlogPost(body: Record<string, unknown>, existing?: BlogPost): BlogPost {
  const status = body.status === "published" ? "published" : "draft";
  return {
    slug: normalizeSlug(requiredText(body.slug, "Slug")),
    title: requiredText(body.title, "Title"),
    excerpt: requiredText(body.excerpt, "Excerpt"),
    coverImage: optionalTrimmed(body.coverImage),
    coverAlt: optionalTrimmed(body.coverAlt),
    body: requiredText(body.body, "Body"),
    status,
    publishedAt: status === "published" ? optionalTrimmed(body.publishedAt) || existing?.publishedAt : undefined,
    createdAt: existing?.createdAt,
    updatedAt: existing?.updatedAt,
  };
}

function serializeBlogPost(item: Record<string, unknown>): BlogPost {
  return {
    slug: String(item.slug || "").trim(),
    title: String(item.title || "").trim(),
    excerpt: String(item.excerpt || "").trim(),
    coverImage: String(item.coverImage || "").trim(),
    coverAlt: String(item.coverAlt || "").trim(),
    body: String(item.body || "").trim(),
    source: "local",
    status: item.status === "published" ? "published" : "draft",
    publishedAt: typeof item.publishedAt === "string" ? item.publishedAt : undefined,
    createdAt: typeof item.createdAt === "string" ? item.createdAt : undefined,
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : undefined,
  };
}

async function listSubstackPosts(substackUrl: string): Promise<BlogPost[]> {
  if (!substackUrl) return [];

  try {
    const feedUrl = `${substackUrl.replace(/\/$/, "")}/feed`;
    const feedResponse = await fetch(feedUrl, {
      headers: {
        Accept: "application/rss+xml, application/xml, text/xml",
      },
    });

    if (!feedResponse.ok) {
      console.warn(`Could not fetch Substack feed: ${feedResponse.status}`);
      return [];
    }

    return parseRssItems(await feedResponse.text());
  } catch (error) {
    console.warn("Could not fetch Substack feed:", error);
    return [];
  }
}

function parseRssItems(xml: string): BlogPost[] {
  const parsed = rssParser.parse(xml) as Record<string, unknown>;
  const channel = getObject(getObject(parsed.rss).channel);
  const items = asArray(channel.item);

  return items
    .map(parseRssItem)
    .filter((post): post is BlogPost => Boolean(post))
    .sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")));
}

function parseRssItem(item: unknown): BlogPost | null {
  const itemObject = getObject(item);
  const title = textValue(itemObject.title);
  const link = textValue(itemObject.link);
  const publishedAt = textValue(itemObject.pubDate);
  const description = textValue(itemObject.description);
  const contentEncoded = textValue(itemObject["content:encoded"]);
  const rawHtml = contentEncoded || description;

  if (!title || !link) return null;

  const cleanHtml = sanitizePostHtml(rawHtml);
  const excerpt = truncate(stripHtml(description || cleanHtml), 180);
  const enclosureImage = enclosureUrl(itemObject.enclosure);

  return {
    slug: slugFromPostUrl(link) || normalizeSlug(title),
    title,
    excerpt,
    coverImage: enclosureImage || firstImage(cleanHtml),
    coverAlt: title,
    body: stripHtml(cleanHtml),
    bodyHtml: cleanHtml,
    externalUrl: link,
    source: "substack",
    status: "published",
    publishedAt: publishedAt ? safeIsoDate(publishedAt) : undefined,
  };
}

function getObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown) {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function textValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }

  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    const text = objectValue["#text"] ?? objectValue.__cdata ?? objectValue._;
    return textValue(text);
  }

  return "";
}

function enclosureUrl(value: unknown) {
  const enclosure = getObject(value);
  const type = textValue(enclosure.type);
  const url = textValue(enclosure.url);
  return type.startsWith("image/") ? url : "";
}

function sanitizePostHtml(value: string) {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\sstyle\s*=\s*"[^"]*"/gi, "")
    .replace(/\sstyle\s*=\s*'[^']*'/gi, "")
    .replace(/\s(href|src)\s*=\s*["']javascript:[^"']*["']/gi, "");
}

function firstImage(html: string) {
  return html.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || "";
}

function stripHtml(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function truncate(value: string, length: number) {
  return value.length > length ? `${value.slice(0, length).trim()}...` : value;
}

function safeIsoDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function slugFromPostUrl(value: string) {
  try {
    return normalizeSlug(new URL(value).pathname.split("/").filter(Boolean).pop() || "");
  } catch {
    return "";
  }
}

function normalizeSlug(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    throw new AuthError(422, "Slug is required.");
  }

  return slug;
}

function slugifyFileName(value: string) {
  const withoutExtension = value.replace(/\.[^.]+$/, "");
  const slug = withoutExtension
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "upload";
}

function extensionForContentType(contentType: string) {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      throw new AuthError(422, "Upload must be a JPG, PNG, WebP or GIF image.");
  }
}

function optionalTrimmed(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeParagraphs(value: unknown, label: string) {
  const paragraphs = Array.isArray(value)
    ? value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
    : typeof value === "string"
      ? value
          .split(/\n{2,}/)
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

  if (paragraphs.length === 0) {
    throw new AuthError(422, `${label} are required.`);
  }

  return paragraphs;
}

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AuthError(422, `${label} is required.`);
  }

  return value.trim();
}

function normalizeHref(value: string) {
  if (value.startsWith("/") || value.startsWith("https://") || value.startsWith("mailto:")) {
    return value;
  }

  throw new AuthError(422, "Button link must start with /, https:// or mailto:");
}

function normalizeOptionalUrl(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") {
    return "";
  }

  const url = requiredText(value, label);

  if (!url.startsWith("https://")) {
    throw new AuthError(422, `${label} must start with https://`);
  }

  return url;
}

async function requireAuth(event: LambdaFunctionUrlEvent) {
  await presenceRequestedBy(event);
}

async function presenceRequestedBy(event: LambdaFunctionUrlEvent) {
  const identity = cognitoIssuer ? await verifyCognitoToken(bearerToken(event)) : null;
  if (!identity) throw new AuthError(401, "Please log in again.");
  const raw = (identity.email || identity.username).trim();
  const safe = raw.replace(/[^\w.@+-]/g, "").slice(0, 180);
  return safe ? `admin:${safe}` : "admin";
}

function requireRunnerAuth(event: LambdaFunctionUrlEvent) {
  const expectedToken = process.env.AUDIT_RUNNER_TOKEN || "";
  if (!expectedToken) {
    throw new AuthError(503, "Audit runner access is not configured.");
  }

  if (!constantTimeEqual(bearerToken(event), expectedToken)) {
    throw new AuthError(401, "Audit runner token is invalid.");
  }
}

function bearerToken(event: LambdaFunctionUrlEvent) {
  const headers = event.headers || {};
  const raw =
    headerValue(headers, "x-first-light-authorization") ||
    headerValue(headers, "authorization");
  if (!raw || raw.startsWith("AWS4-HMAC-SHA256 ")) return "";
  return raw.startsWith("Bearer ") ? raw.slice(7).trim() : "";
}

function headerValue(headers: Record<string, string | undefined>, name: string) {
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target && value) return value.trim();
  }
  return "";
}

function resolveBrowserOrigin(event: LambdaFunctionUrlEvent) {
  if (process.env.ALLOW_VIEWER_ORIGIN !== "true") return "";
  const headers = event.headers || {};
  const origin = headerValue(headers, "origin");
  if (origin && isPermittedBrowserOrigin(origin)) return new URL(origin).origin;
  const host = headerValue(headers, "x-viewer-host").split(",")[0]?.trim() || "";
  const fromHost = host ? `https://${host}` : "";
  if (fromHost && isPermittedBrowserOrigin(fromHost)) return new URL(fromHost).origin;
  return "";
}

function isPermittedBrowserOrigin(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username || url.password || (url.pathname !== "/" && url.pathname !== "")) return false;
  if (allowedOrigins.includes(url.origin)) return true;
  return (
    url.protocol === "https:" &&
    url.port === "" &&
    url.hostname.endsWith(".cloudfront.net") &&
    url.hostname !== "cloudfront.net"
  );
}

async function verifyCognitoToken(token: string): Promise<{ username: string; email: string } | null> {
  const [headerRaw, payloadRaw, signatureRaw] = token.split(".");

  if (!headerRaw || !payloadRaw || !signatureRaw || !cognitoIssuer) {
    return null;
  }

  try {
    const header = JSON.parse(base64UrlDecode(headerRaw).toString("utf8")) as { kid?: string; alg?: string };
    const payload = JSON.parse(base64UrlDecode(payloadRaw).toString("utf8")) as {
      iss?: string;
      exp?: number;
      token_use?: string;
      client_id?: string;
      aud?: string;
      username?: string;
      email?: string;
      "cognito:username"?: string;
    };

    if (
      header.alg !== "RS256" ||
      !header.kid ||
      payload.iss !== cognitoIssuer ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(Date.now() / 1000) ||
      !["access", "id"].includes(payload.token_use || "")
    ) {
      return null;
    }

    const tokenClientId = payload.client_id || payload.aud;
    const expectedClientId = await getExpectedClientId();
    if (!expectedClientId || tokenClientId !== expectedClientId) {
      return null;
    }

    const keys = await getJwks();
    const jwk = keys.find((key) => key.kid === header.kid);
    if (!jwk) return null;

    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlDecode(signatureRaw),
      Buffer.from(`${headerRaw}.${payloadRaw}`),
    );
    if (!verified) return null;

    const username = typeof payload["cognito:username"] === "string" ? payload["cognito:username"] : payload.username || "";
    const email = typeof payload.email === "string" ? payload.email : "";
    return { username, email };
  } catch (error) {
    console.error("Cognito token verification failed:", error);
    return null;
  }
}

async function getJwks() {
  const now = Date.now();
  if (jwksCache && jwksCache.expiresAt > now) {
    return jwksCache.keys;
  }

  const response = await fetch(`${cognitoIssuer}/.well-known/jwks.json`);
  if (!response.ok) {
    throw new AuthError(503, "Could not verify login session.");
  }

  const body = (await response.json()) as { keys?: CognitoJwk[] };
  jwksCache = {
    keys: body.keys || [],
    expiresAt: now + 60 * 60 * 1000,
  };

  return jwksCache.keys;
}

async function getExpectedClientId() {
  const fromEnv = process.env.COGNITO_CLIENT_ID || "";
  if (fromEnv) return fromEnv;
  if (cachedCognitoClientId !== undefined) return cachedCognitoClientId;

  const parameterName = process.env.COGNITO_CLIENT_ID_PARAMETER || "";
  if (!parameterName) return "";

  try {
    const result = await ssm.send(new GetParameterCommand({ Name: parameterName }));
    cachedCognitoClientId = result.Parameter?.Value || "";
    return cachedCognitoClientId;
  } catch (error) {
    console.error("Could not read Cognito client id:", error);
    return "";
  }
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url");
}

function constantTimeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function parseJson(rawBody?: string) {
  try {
    return JSON.parse(rawBody || "{}") as Record<string, unknown>;
  } catch {
    throw new AuthError(400, "Invalid JSON.");
  }
}

function normalizePath(path: string) {
  const withoutTrailingSlash = path.replace(/\/$/, "");
  return withoutTrailingSlash || "/";
}

function response(statusCode: number, body: unknown) {
  return {
    statusCode,
    headers: cors(),
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

function cors() {
  return {
    "Access-Control-Allow-Origin": allowedOrigins[0] || "https://firstlightmarketing.co.uk",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, X-First-Light-Authorization, x-amz-content-sha256",
    "Content-Type": "application/json",
  };
}

class AuthError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
