export interface ManagedAnnouncement {
  enabled: boolean;
  eyebrow: string;
  title: string;
  body: string;
  buttonLabel: string;
  buttonHref: string;
}

export interface ManagedHomeContent {
  heroHeading: string;
  heroButtonLabel: string;
  capabilityStrip: string;
  firstLightQuote: string;
  introParagraphs: string[];
  contactEyebrow: string;
  contactTitle: string;
  contactBody: string;
}

export interface ManagedServicesContent {
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
}

export interface ManagedWorkContent {
  heroHeading: string;
  heroSubheading: string;
  introEyebrow: string;
  introBody: string;
  ctaHeading: string;
  ctaButtonLabel: string;
}

export interface ManagedAboutContent {
  heroHeading: string;
  heroSubheading: string;
  sectionHeading: string;
  paragraphs: string[];
  educationLabel: string;
  educationText: string;
  experienceLabel: string;
  experienceText: string;
}

export interface ManagedApproachContent {
  heroHeading: string;
  heroSubheading: string;
  closing: string;
  ctaHeading: string;
  ctaBody: string;
  ctaButtonLabel: string;
}

export interface ManagedContactContent {
  eyebrow: string;
  heading: string;
  body: string;
  formEyebrow: string;
  formHeading: string;
  emailTitle: string;
  emailDescription: string;
  tiktokTitle: string;
  tiktokDescription: string;
}

export interface ManagedSiteContent {
  home: ManagedHomeContent;
  services: ManagedServicesContent;
  work: ManagedWorkContent;
  about: ManagedAboutContent;
  approach: ManagedApproachContent;
  contact: ManagedContactContent;
  announcement: ManagedAnnouncement;
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
  updatedAt?: string;
}

export type BlogStatus = "draft" | "published";

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  coverImage: string;
  coverAlt: string;
  body: string;
  bodyHtml?: string;
  externalUrl?: string;
  source?: "local" | "substack";
  status: BlogStatus;
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface MediaAsset {
  id: string;
  key: string;
  url: string;
  fileName: string;
  contentType: string;
  createdAt: string;
}

export interface AuditSettings {
  recommendationsEnabled: boolean;
  aiEnabled: boolean;
  instagramUsername: string;
  instagramLoginUsername: string;
  defaultPostLimit: number;
  hasDeepseekKey: boolean;
  updatedAt?: string;
}

export type AuditReportStatus = "queued" | "running" | "completed" | "failed";

export interface AuditReport {
  id: string;
  handle: string;
  postLimit: number;
  recommendationsEnabled: boolean;
  aiEnabled: boolean;
  status: AuditReportStatus;
  fileName: string;
  s3Key?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface PresenceHandles {
  instagram: string;
  tiktok: string;
  facebook: string;
}

export type PresenceRunStatus = "queued" | "running" | "succeeded" | "needs_review" | "failed" | "cancelled";
export type PresenceStatusLabel = "Queued" | "Running" | "Completed" | "Needs review" | "Failed" | "Cancelled" | "Not tracked";
export type PresenceCostLabel = "Free" | "Estimated" | "Actual" | "Released";

export interface PresenceRun {
  id: string;
  businessId: string;
  company: string;
  website: string;
  handles: PresenceHandles;
  business: string;
  area: string;
  googleMaps: string;
  testMode: boolean;
  status: PresenceRunStatus;
  statusLabel: PresenceStatusLabel;
  completed: boolean;
  needsReview: boolean;
  errorCode?: string;
  errorMessage?: string;
  qualityFailures: string[];
  statusMessage: string;
  fileName: string;
  estimatedCostUsd: number;
  costUsd?: number;
  costLabel: PresenceCostLabel;
  trackingStopped: boolean;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
  downloadReady: boolean;
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

export interface PresenceRunInput {
  company: string;
  website?: string;
  handles?: {
    instagram?: string;
    tiktok?: string;
    facebook?: string;
  };
  business?: string;
  area?: string;
  googleMaps?: string;
  testMode: boolean;
}

export interface AdminLead {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  phone?: string;
  business?: string;
  servicesNeeded: string[];
  challenge: string;
  challengeOther?: string;
  budgetRange: string;
  comments?: string;
  responded: boolean;
  respondedAt?: string;
}
