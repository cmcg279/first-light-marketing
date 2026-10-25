import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  cancelPresenceRun,
  completeAdminLogin,
  clearAdminToken,
  createAuditReport,
  createPresenceRun,
  deleteBlogPost,
  deleteAuditReport,
  deleteLead,
  getAuditReportDownloadUrl,
  getAuditReports,
  getAuditSettings,
  getAdminBlogPosts,
  getAdminLeads,
  getAdminToken,
  getMediaAssets,
  getManagedContent,
  getPresenceDownloadUrl,
  getPresenceRuns,
  logoutAdmin,
  retryPresenceRun,
  saveBlogPost,
  saveAuditSettings,
  saveManagedContent,
  startAdminLogin,
  updateLeadStatus,
  uploadAuditReportPdf,
  uploadMediaAsset,
} from "../lib/adminApi";
import { Seo } from "../components/Seo";
import type {
  AdminLead,
  AuditReport,
  AuditSettings,
  BlogPost,
  ManagedSiteContent,
  MediaAsset,
  PresenceRun,
  PresenceRunInput,
  PresenceSpendSummary,
} from "../types/admin";

const emptyContent: ManagedSiteContent = {
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

const emptyPost: BlogPost = {
  slug: "",
  title: "",
  excerpt: "",
  coverImage: "",
  coverAlt: "",
  body: "",
  status: "draft",
};

const defaultAuditSettings: AuditSettings = {
  recommendationsEnabled: true,
  aiEnabled: false,
  instagramUsername: "",
  instagramLoginUsername: "",
  defaultPostLimit: 30,
  hasDeepseekKey: false,
};

export default function Admin() {
  const [token, setToken] = useState(() => getAdminToken());
  const [loginError, setLoginError] = useState("");

  const [activeTab, setActiveTab] = useState<"leads" | "reports" | "presence" | "announcement" | "settings" | "media">("leads");
  const [leads, setLeads] = useState<AdminLead[]>([]);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [auditSettings, setAuditSettings] = useState<AuditSettings>(defaultAuditSettings);
  const [auditReports, setAuditReports] = useState<AuditReport[]>([]);
  const [presenceRuns, setPresenceRuns] = useState<PresenceRun[]>([]);
  const [presenceSpend, setPresenceSpend] = useState<PresenceSpendSummary | null>(null);
  const [editingPost, setEditingPost] = useState<BlogPost>(emptyPost);
  const [content, setContent] = useState<ManagedSiteContent>(emptyContent);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [leadActionId, setLeadActionId] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([
      getAdminLeads(),
      getManagedContent(),
      getMediaAssets(),
      getAuditSettings(),
      getAuditReports(),
      getPresenceRuns(),
    ])
      .then(([nextLeads, nextContent, nextMediaAssets, nextAuditSettings, nextAuditReports, nextPresence]) => {
        if (cancelled) return;
        setLeads(nextLeads);
        setContent(nextContent);
        setMediaAssets(nextMediaAssets);
        setAuditSettings(nextAuditSettings);
        setAuditReports(nextAuditReports);
        setPresenceRuns(nextPresence.runs);
        setPresenceSpend(nextPresence.spend);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load admin data.");
        if (err instanceof Error && err.message.toLowerCase().includes("log in")) {
          clearAdminToken();
          setToken("");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (token) return;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const authError = params.get("error_description") || params.get("error");

    if (authError) {
      setLoginError(authError);
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    if (!code || !state) return;

    setLoading(true);
    setLoginError("");

    completeAdminLogin(code, state)
      .then((nextToken) => {
        setToken(nextToken);
        window.history.replaceState({}, "", window.location.pathname);
      })
      .catch((err) => {
        setLoginError(err instanceof Error ? err.message : "Login failed.");
        window.history.replaceState({}, "", window.location.pathname);
      })
      .finally(() => setLoading(false));
  }, [token]);

  const leadCount = leads.length;
  const openLeadCount = leads.filter((lead) => !lead.responded).length;
  const latestLead = useMemo(() => leads[0], [leads]);

  async function handleLogin() {
    setLoginError("");
    setLoading(true);

    try {
      await startAdminLogin();
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed.");
      setLoading(false);
    }
  }

  async function logout() {
    try {
      await logoutAdmin();
    } catch {
      clearAdminToken();
      setToken("");
      setLeads([]);
      setMediaAssets([]);
    } finally {
      clearAdminToken();
    }
  }

  async function handleSaveContent(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    setError("");

    try {
      const saved = await saveManagedContent(content);
      setContent(saved);
      setStatus("Content saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save content.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePost(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setStatus("");
    setError("");

    try {
      const saved = await saveBlogPost(editingPost);
      setBlogPosts((current) => {
        const exists = current.some((post) => post.slug === saved.slug);
        return exists
          ? current.map((post) => (post.slug === saved.slug ? saved : post))
          : [saved, ...current];
      });
      setEditingPost(saved);
      setStatus(saved.status === "published" ? "Blog post published." : "Blog draft saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save blog post.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeletePost(post: BlogPost) {
    const confirmed = window.confirm(`Delete "${post.title}"? This cannot be undone.`);
    if (!confirmed) return;

    setSaving(true);
    setStatus("");
    setError("");

    try {
      await deleteBlogPost(post.slug);
      setBlogPosts((current) => current.filter((item) => item.slug !== post.slug));
      if (editingPost.slug === post.slug) setEditingPost(emptyPost);
      setStatus("Blog post deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete blog post.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadMedia(file: File) {
    setUploading(true);
    setStatus("");
    setError("");

    try {
      const asset = await uploadMediaAsset(file);
      setMediaAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)]);
      setStatus("Image uploaded.");
      return asset;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload image.");
      throw err;
    } finally {
      setUploading(false);
    }
  }

  async function handleSaveAuditSettings(settings: AuditSettings, deepseekKey: string) {
    setSaving(true);
    setStatus("");
    setError("");

    try {
      const saved = await saveAuditSettings({ ...settings, deepseekKey });
      setAuditSettings(saved);
      setStatus(deepseekKey.trim() ? "Audit settings and DeepSeek key saved." : "Audit settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save audit settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateAuditReport(input: {
    handle: string;
    postLimit: number;
    recommendationsEnabled: boolean;
    aiEnabled: boolean;
  }) {
    setSaving(true);
    setStatus("");
    setError("");

    try {
      const report = await createAuditReport(input);
      setAuditReports((current) => [report, ...current]);
      setStatus("Report record created. Upload the PDF when it is ready.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create audit report.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadAuditReport(report: AuditReport, file: File) {
    setSaving(true);
    setStatus("");
    setError("");

    try {
      const updatedReport = await uploadAuditReportPdf(report.id, file);
      setAuditReports((current) =>
        current.map((item) => (item.id === updatedReport.id ? updatedReport : item)),
      );
      setStatus("Report PDF uploaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload report PDF.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadAuditReport(report: AuditReport) {
    setStatus("");
    setError("");

    try {
      const downloadUrl = await getAuditReportDownloadUrl(report.id);
      window.location.assign(downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download audit report.");
    }
  }

  async function handleDeleteAuditReport(report: AuditReport) {
    const confirmed = window.confirm(`Delete the report for @${report.handle}? This cannot be undone.`);
    if (!confirmed) return;

    setSaving(true);
    setStatus("");
    setError("");

    try {
      await deleteAuditReport(report.id);
      setAuditReports((current) => current.filter((item) => item.id !== report.id));
      setStatus("Audit report deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete audit report.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRefreshAuditReports() {
    setStatus("");
    setError("");

    try {
      const reports = await getAuditReports();
      setAuditReports(reports);
      setStatus("Reports refreshed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh reports.");
    }
  }

  const refreshPresenceRuns = useCallback(async () => {
    const result = await getPresenceRuns();
    setPresenceRuns(result.runs);
    setPresenceSpend(result.spend);
    return result;
  }, []);

  async function handleCreatePresenceRun(input: PresenceRunInput) {
    setSaving(true);
    setStatus("");
    setError("");

    try {
      const result = await createPresenceRun(input);
      setPresenceRuns((current) => [result.run, ...current.filter((run) => run.id !== result.run.id)]);
      setPresenceSpend(result.spend);
      setStatus(result.run.testMode ? "Free test run queued." : "Real audit queued.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the audit.");
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelPresenceRun(run: PresenceRun) {
    const confirmed = window.confirm(
      `Stop tracking the audit for ${run.company}? The worker has no cancel, so a run that has already started may still finish and the spend may already be committed. This releases the cap reservation.`,
    );
    if (!confirmed) return;

    setSaving(true);
    setStatus("");
    setError("");

    try {
      const result = await cancelPresenceRun(run.id);
      setPresenceRuns((current) => current.map((item) => (item.id === result.run.id ? result.run : item)));
      setPresenceSpend(result.spend);
      setStatus("Tracking stopped. The reservation was released. Spend that is already committed is not undone.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not stop tracking the audit.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRetryPresenceRun(run: PresenceRun) {
    setSaving(true);
    setStatus("");
    setError("");

    try {
      const result = await retryPresenceRun(run.id);
      setPresenceRuns((current) => [result.run, ...current.filter((item) => item.id !== result.run.id)]);
      setPresenceSpend(result.spend);
      setStatus(result.run.testMode ? "A new free test run was queued." : "A new audit was queued.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not retry the audit.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadPresenceRun(run: PresenceRun) {
    setStatus("");
    setError("");

    try {
      const downloadUrl = await getPresenceDownloadUrl(run.id);
      window.location.assign(downloadUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not download the audit.");
    }
  }

  async function handleToggleResponded(lead: AdminLead) {
    setLeadActionId(lead.id);
    setStatus("");
    setError("");

    try {
      const updatedLead = await updateLeadStatus(lead.id, !lead.responded);
      setLeads((current) =>
        current.map((item) => (item.id === lead.id ? updatedLead : item)),
      );
      setStatus(updatedLead.responded ? "Lead marked as responded." : "Lead marked as open.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update lead.");
    } finally {
      setLeadActionId("");
    }
  }

  async function handleDeleteLead(lead: AdminLead) {
    const confirmed = window.confirm(`Delete the enquiry from ${lead.name}? This cannot be undone.`);
    if (!confirmed) return;

    setLeadActionId(lead.id);
    setStatus("");
    setError("");

    try {
      await deleteLead(lead.id);
      setLeads((current) => current.filter((item) => item.id !== lead.id));
      setStatus("Lead deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete lead.");
    } finally {
      setLeadActionId("");
    }
  }

  if (!token) {
    return (
      <>
        <Seo title="Admin" description="First Light Marketing admin portal." path="/admin" noindex />
        <section className="min-h-[70vh] bg-off-white px-6 py-20">
          <div className="mx-auto max-w-md rounded-lg border border-body/10 bg-white p-8 shadow-sm">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-coral">
            First Light Admin
          </p>
          <h1 className="mt-3 font-serif text-3xl font-bold text-body">Sign in</h1>
          <p className="mt-3 font-sans text-sm leading-relaxed text-body/60">
            View enquiries, run presence audits and manage the site.
          </p>

          <div className="mt-8 space-y-5">
            {loginError && (
              <p className="rounded-lg border border-coral/30 bg-coral/[0.06] px-4 py-3 font-sans text-sm text-coral">
                {loginError}
              </p>
            )}

            <button
              type="button"
              onClick={handleLogin}
              disabled={loading}
              className="w-full rounded-full bg-coral px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-off-white transition hover:bg-coral-700 disabled:opacity-40"
            >
              {loading ? "Opening sign in..." : "Sign in securely"}
            </button>
          </div>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <Seo title="Admin" description="First Light Marketing admin portal." path="/admin" noindex />
      <section className="min-h-screen bg-off-white px-6 py-10">
        <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-5 border-b border-body/10 pb-8 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-coral">
              First Light Admin
            </p>
            <h1 className="mt-3 font-serif text-4xl font-bold text-body">Admin portal</h1>
            <p className="mt-3 max-w-2xl font-sans text-base leading-relaxed text-body/60">
              Review form submissions, run presence audits, manage the homepage announcement, update blog settings and upload media.
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="self-start rounded-full border border-body/15 px-5 py-2.5 font-sans text-xs font-semibold uppercase tracking-wider text-body/60 transition hover:border-coral hover:text-coral"
          >
            Log out
          </button>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <MetricCard label="Total leads" value={String(leadCount)} />
          <MetricCard label="Open leads" value={String(openLeadCount)} />
          <MetricCard label="Latest enquiry" value={latestLead ? formatDate(latestLead.createdAt) : "None yet"} />
        </div>

        <div className="mt-8 flex flex-wrap gap-2 border-b border-body/10">
          <TabButton active={activeTab === "leads"} onClick={() => setActiveTab("leads")}>
            Submissions
          </TabButton>
          <TabButton active={activeTab === "reports"} onClick={() => setActiveTab("reports")}>
            Reports
          </TabButton>
          <TabButton active={activeTab === "presence"} onClick={() => setActiveTab("presence")}>
            Presence
          </TabButton>
          <TabButton active={activeTab === "announcement"} onClick={() => setActiveTab("announcement")}>
            Announcement
          </TabButton>
          <TabButton active={activeTab === "settings"} onClick={() => setActiveTab("settings")}>
            Settings
          </TabButton>
          <TabButton active={activeTab === "media"} onClick={() => setActiveTab("media")}>
            Media
          </TabButton>
        </div>

        {loading && <p className="mt-8 font-sans text-sm text-body/60">Loading admin data...</p>}
        {error && (
          <p className="mt-8 rounded-lg border border-coral/30 bg-white px-4 py-3 font-sans text-sm text-coral">
            {error}
          </p>
        )}
        {status && (
          <p className="mt-8 rounded-lg border border-body/10 bg-white px-4 py-3 font-sans text-sm text-body/70">
            {status}
          </p>
        )}

        {activeTab === "leads" && (
          <LeadsTable
            leads={leads}
            actionLeadId={leadActionId}
            onToggleResponded={handleToggleResponded}
            onDeleteLead={handleDeleteLead}
          />
        )}
        {activeTab === "announcement" && (
          <AnnouncementEditor
            content={content}
            saving={saving}
            onChange={setContent}
            onSubmit={handleSaveContent}
          />
        )}
        {activeTab === "presence" && presenceSpend && (
          <PresenceAudits
            runs={presenceRuns}
            spend={presenceSpend}
            saving={saving}
            onCreate={handleCreatePresenceRun}
            onCancel={handleCancelPresenceRun}
            onRetry={handleRetryPresenceRun}
            onDownload={handleDownloadPresenceRun}
            onRefresh={refreshPresenceRuns}
          />
        )}
        {activeTab === "reports" && (
          <AuditReportsManager
            settings={auditSettings}
            reports={auditReports}
            saving={saving}
            onCreateReport={handleCreateAuditReport}
            onUploadReport={handleUploadAuditReport}
            onDownloadReport={handleDownloadAuditReport}
            onDeleteReport={handleDeleteAuditReport}
            onRefreshReports={handleRefreshAuditReports}
          />
        )}
        {activeTab === "settings" && (
          <SettingsEditor
            content={content}
            auditSettings={auditSettings}
            saving={saving}
            onChange={setContent}
            onSubmit={handleSaveContent}
            onSaveAuditSettings={handleSaveAuditSettings}
          />
        )}
        {activeTab === "media" && (
          <MediaLibrary
            assets={mediaAssets}
            uploading={uploading}
            onUploadMedia={handleUploadMedia}
          />
        )}
        </div>
      </section>
    </>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-body/10 bg-white p-5">
      <p className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-body/45">{label}</p>
      <p className="mt-3 font-serif text-2xl font-bold text-body">{value}</p>
    </div>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-4 py-3 font-sans text-sm font-semibold transition ${
        active ? "border-coral text-coral" : "border-transparent text-body/55 hover:text-body"
      }`}
    >
      {children}
    </button>
  );
}

function LeadsTable({
  leads,
  actionLeadId,
  onToggleResponded,
  onDeleteLead,
}: {
  leads: AdminLead[];
  actionLeadId: string;
  onToggleResponded: (lead: AdminLead) => void;
  onDeleteLead: (lead: AdminLead) => void;
}) {
  if (leads.length === 0) {
    return (
      <div className="mt-8 rounded-lg border border-body/10 bg-white p-8 text-center">
        <p className="font-serif text-2xl font-semibold text-body">No enquiries yet</p>
        <p className="mt-2 font-sans text-sm text-body/60">
          New contact form submissions will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 overflow-hidden rounded-lg border border-body/10 bg-white">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-body/10 text-left">
          <thead className="bg-cream">
            <tr>
              {["Status", "Date", "Lead", "Services", "Challenge", "Budget", "Notes", "Actions"].map((heading) => (
                <th key={heading} className="px-5 py-4 font-sans text-xs font-semibold uppercase tracking-[0.16em] text-body/45">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-body/10">
            {leads.map((lead) => (
              <tr key={lead.id} className="align-top">
                <td className="whitespace-nowrap px-5 py-5">
                  <span
                    className={`inline-flex rounded-full px-3 py-1 font-sans text-xs font-semibold uppercase tracking-[0.12em] ${
                      lead.responded
                        ? "bg-body/10 text-body/55"
                        : "bg-coral/10 text-coral"
                    }`}
                  >
                    {lead.responded ? "Responded" : "Open"}
                  </span>
                  {lead.respondedAt && (
                    <p className="mt-2 font-sans text-xs text-body/40">
                      {formatDate(lead.respondedAt)}
                    </p>
                  )}
                </td>
                <td className="whitespace-nowrap px-5 py-5 font-sans text-sm text-body/60">
                  {formatDate(lead.createdAt)}
                </td>
                <td className="px-5 py-5">
                  <p className="font-sans text-sm font-semibold text-body">{lead.name}</p>
                  <a href={`mailto:${lead.email}`} className="mt-1 block font-sans text-sm text-coral">
                    {lead.email}
                  </a>
                  {lead.phone && (
                    <a href={`tel:${lead.phone}`} className="mt-1 block font-sans text-sm text-body/60">
                      {lead.phone}
                    </a>
                  )}
                  {lead.business && <p className="mt-1 font-sans text-xs text-body/45">{lead.business}</p>}
                </td>
                <td className="px-5 py-5 font-sans text-sm text-body/65">
                  {lead.servicesNeeded.join(", ")}
                </td>
                <td className="px-5 py-5 font-sans text-sm text-body/65">
                  {lead.challenge}
                  {lead.challengeOther ? `: ${lead.challengeOther}` : ""}
                </td>
                <td className="whitespace-nowrap px-5 py-5 font-sans text-sm text-body/65">
                  {lead.budgetRange}
                </td>
                <td className="max-w-xs px-5 py-5 font-sans text-sm leading-relaxed text-body/65">
                  {lead.comments || "No notes"}
                </td>
                <td className="whitespace-nowrap px-5 py-5">
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleResponded(lead)}
                      disabled={actionLeadId === lead.id}
                      className="rounded-full border border-body/15 px-4 py-2 font-sans text-xs font-semibold uppercase tracking-[0.12em] text-body/60 transition hover:border-coral hover:text-coral disabled:opacity-40"
                    >
                      {lead.responded ? "Mark open" : "Mark responded"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteLead(lead)}
                      disabled={actionLeadId === lead.id}
                      className="rounded-full border border-coral/25 px-4 py-2 font-sans text-xs font-semibold uppercase tracking-[0.12em] text-coral transition hover:bg-coral hover:text-off-white disabled:opacity-40"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AnnouncementEditor({
  content,
  saving,
  onChange,
  onSubmit,
}: {
  content: ManagedSiteContent;
  saving: boolean;
  onChange: (content: ManagedSiteContent) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const announcement = content.announcement;

  function updateAnnouncement(field: keyof typeof announcement, value: string | boolean) {
    onChange({
      ...content,
      announcement: {
        ...announcement,
        [field]: value,
      },
    });
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 max-w-3xl rounded-lg border border-body/10 bg-white p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-serif text-2xl font-bold text-body">Homepage announcement</h2>
          <p className="mt-2 font-sans text-sm text-body/60">
            A small editable band for timely updates, availability or featured offers.
          </p>
        </div>
        <label className="flex items-center gap-3 font-sans text-sm font-medium text-body/70">
          <input
            type="checkbox"
            checked={announcement.enabled}
            onChange={(event) => updateAnnouncement("enabled", event.target.checked)}
            className="h-5 w-5 rounded border-body/20 text-coral focus:ring-coral"
          />
          Live
        </label>
      </div>

      <div className="mt-8 grid gap-5">
        <TextField
          label="Eyebrow"
          value={announcement.eyebrow}
          onChange={(value) => updateAnnouncement("eyebrow", value)}
        />
        <TextField
          label="Title"
          value={announcement.title}
          onChange={(value) => updateAnnouncement("title", value)}
        />
        <TextAreaField
          label="Body"
          value={announcement.body}
          rows={5}
          onChange={(value) => updateAnnouncement("body", value)}
        />
        <div className="grid gap-5 md:grid-cols-2">
          <TextField
            label="Button label"
            value={announcement.buttonLabel}
            onChange={(value) => updateAnnouncement("buttonLabel", value)}
          />
          <TextField
            label="Button link"
            value={announcement.buttonHref}
            onChange={(value) => updateAnnouncement("buttonHref", value)}
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="mt-8 rounded-full bg-coral px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-off-white transition hover:bg-coral-700 disabled:opacity-40"
      >
        {saving ? "Saving..." : "Save announcement"}
      </button>
    </form>
  );
}

function SettingsEditor({
  content,
  auditSettings,
  saving,
  onChange,
  onSubmit,
  onSaveAuditSettings,
}: {
  content: ManagedSiteContent;
  auditSettings: AuditSettings;
  saving: boolean;
  onChange: (content: ManagedSiteContent) => void;
  onSubmit: (event: FormEvent) => void;
  onSaveAuditSettings: (settings: AuditSettings, deepseekKey: string) => void;
}) {
  const [copyStatus, setCopyStatus] = useState("");
  const [draftAuditSettings, setDraftAuditSettings] = useState(auditSettings);
  const [deepseekKey, setDeepseekKey] = useState("");
  const substackFooter = content.emailTemplates.substackFooter;

  useEffect(() => {
    setDraftAuditSettings(auditSettings);
  }, [auditSettings]);

  function updateSettings(nextSettings: Partial<typeof content.settings>) {
    onChange({
      ...content,
      settings: {
        ...content.settings,
        ...nextSettings,
      },
    });
  }

  function updateSubstackFooter(field: keyof typeof substackFooter, value: string) {
    onChange({
      ...content,
      emailTemplates: {
        ...content.emailTemplates,
        substackFooter: {
          ...substackFooter,
          [field]: value,
        },
      },
    });
  }

  async function copyFooter() {
    const footerText = [
      substackFooter.heading,
      "",
      substackFooter.body,
      "",
      `${substackFooter.buttonLabel}: ${substackFooter.buttonHref}`,
      "",
      substackFooter.signoff,
    ].join("\n");

    await window.navigator.clipboard.writeText(footerText);
    setCopyStatus("Copied.");
    window.setTimeout(() => setCopyStatus(""), 1800);
  }

  function updateAuditSettings(nextSettings: Partial<AuditSettings>) {
    setDraftAuditSettings((current) => ({
      ...current,
      ...nextSettings,
    }));
  }

  function submitAuditSettings(event: FormEvent) {
    event.preventDefault();
    onSaveAuditSettings(draftAuditSettings, deepseekKey);
    setDeepseekKey("");
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <form onSubmit={onSubmit} className="rounded-lg border border-body/10 bg-white p-6">
          <div>
            <h2 className="font-serif text-2xl font-bold text-body">Blog and newsletter settings</h2>
            <p className="mt-2 font-sans text-sm text-body/60">
              Use Substack as the writing and email tool while First Light renders the posts natively on the site.
            </p>
          </div>

          <label className="mt-8 flex items-center gap-3 font-sans text-sm font-medium text-body/70">
            <input
              type="checkbox"
              checked={content.settings.blogEnabled}
              onChange={(event) => updateSettings({ blogEnabled: event.target.checked })}
              className="h-5 w-5 rounded border-body/20 text-coral focus:ring-coral"
            />
            Show Blog in the site navigation
          </label>

          <div className="mt-6">
            <TextField
              label="Substack publication URL"
              value={content.settings.substackUrl}
              onChange={(value) => updateSettings({ substackUrl: value })}
            />
            <p className="mt-2 font-sans text-xs leading-relaxed text-body/45">
              Paste the publication URL, for example https://firstlightmarketing.substack.com. The site will read its RSS feed at /feed.
            </p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="mt-8 rounded-full bg-coral px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-off-white transition hover:bg-coral-700 disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save blog settings"}
          </button>
        </form>

        <form onSubmit={submitAuditSettings} className="rounded-lg border border-body/10 bg-white p-6">
          <div>
            <h2 className="font-serif text-2xl font-bold text-body">Audit report settings</h2>
            <p className="mt-2 font-sans text-sm leading-relaxed text-body/60">
              Defaults and API keys for Instagram audit reports. Niamh can override recommendations and AI when creating each report.
            </p>
          </div>

          <div className="mt-8 grid gap-5">
            <TextField
              label="Default audit handle"
              value={draftAuditSettings.instagramUsername}
              onChange={(value) => updateAuditSettings({ instagramUsername: value })}
            />
            <TextField
              label="Instagram login username"
              value={draftAuditSettings.instagramLoginUsername}
              onChange={(value) => updateAuditSettings({ instagramLoginUsername: value })}
            />
            <TextField
              label="Default post limit"
              type="number"
              min={5}
              max={100}
              value={String(draftAuditSettings.defaultPostLimit)}
              onChange={(value) => updateAuditSettings({ defaultPostLimit: Number(value) })}
            />
            <div>
              <TextField
                label={draftAuditSettings.hasDeepseekKey ? "Replace DeepSeek API key" : "DeepSeek API key"}
                type="password"
                value={deepseekKey}
                onChange={setDeepseekKey}
              />
              <p className="mt-2 font-sans text-xs leading-relaxed text-body/45">
                {draftAuditSettings.hasDeepseekKey
                  ? "A DeepSeek key is already saved. Leave this blank to keep it."
                  : "Paste a DeepSeek key if AI recommendations should be available."}
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-8 rounded-full bg-coral px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-off-white transition hover:bg-coral-700 disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save audit settings"}
          </button>
        </form>

        <form onSubmit={onSubmit} className="rounded-lg border border-body/10 bg-white p-6">
          <div>
            <h2 className="font-serif text-2xl font-bold text-body">Substack footer</h2>
            <p className="mt-2 font-sans text-sm text-body/60">
              Reusable CTA copy for the bottom of every newsletter post.
            </p>
          </div>

          <div className="mt-8 grid gap-5">
            <TextField
              label="Footer heading"
              value={substackFooter.heading}
              onChange={(value) => updateSubstackFooter("heading", value)}
            />
            <TextAreaField
              label="Footer body"
              value={substackFooter.body}
              rows={5}
              onChange={(value) => updateSubstackFooter("body", value)}
            />
            <div className="grid gap-5 md:grid-cols-2">
              <TextField
                label="CTA label"
                value={substackFooter.buttonLabel}
                onChange={(value) => updateSubstackFooter("buttonLabel", value)}
              />
              <TextField
                label="CTA link"
                value={substackFooter.buttonHref}
                onChange={(value) => updateSubstackFooter("buttonHref", value)}
              />
            </div>
            <TextAreaField
              label="Signoff"
              value={substackFooter.signoff}
              rows={3}
              onChange={(value) => updateSubstackFooter("signoff", value)}
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-8 rounded-full bg-coral px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-off-white transition hover:bg-coral-700 disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save footer"}
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-body/10 bg-cream p-6 lg:sticky lg:top-6 lg:self-start">
        <p className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-body/45">
          How it works
        </p>
        <div className="mt-5 space-y-4 font-sans text-sm leading-relaxed text-body/65">
          <p>Niamh writes, schedules and emails posts from Substack.</p>
          <p>First Light reads the RSS feed and shows those posts inside the native Blog page.</p>
          <p>The original Substack post URL stays available, but visitors can read on the website first.</p>
        </div>
        <div className="mt-6 rounded-lg bg-white p-5">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-coral">
            Footer preview
          </p>
          <h3 className="mt-3 font-serif text-xl font-bold leading-tight text-body">
            {substackFooter.heading}
          </h3>
          <p className="mt-3 font-sans text-sm leading-relaxed text-body/65">
            {substackFooter.body}
          </p>
          <a
            href={substackFooter.buttonHref}
            className="mt-5 inline-flex rounded-full bg-coral px-5 py-2.5 font-sans text-xs font-semibold uppercase tracking-wider text-off-white"
          >
            {substackFooter.buttonLabel}
          </a>
          <p className="mt-5 whitespace-pre-line font-sans text-sm leading-relaxed text-body/60">
            {substackFooter.signoff}
          </p>
          <button
            type="button"
            onClick={copyFooter}
            className="mt-5 rounded-full border border-body/15 px-4 py-2 font-sans text-xs font-semibold uppercase tracking-[0.12em] text-body/60 transition hover:border-coral hover:text-coral"
          >
            {copyStatus || "Copy footer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AuditReportsManager({
  settings,
  reports,
  saving,
  onCreateReport,
  onUploadReport,
  onDownloadReport,
  onDeleteReport,
  onRefreshReports,
}: {
  settings: AuditSettings;
  reports: AuditReport[];
  saving: boolean;
  onCreateReport: (input: {
    handle: string;
    postLimit: number;
    recommendationsEnabled: boolean;
    aiEnabled: boolean;
  }) => void;
  onUploadReport: (report: AuditReport, file: File) => Promise<void>;
  onDownloadReport: (report: AuditReport) => void;
  onDeleteReport: (report: AuditReport) => void;
  onRefreshReports: () => void;
}) {
  const [reportHandle, setReportHandle] = useState(settings.instagramUsername);
  const [reportPostLimit, setReportPostLimit] = useState(String(settings.defaultPostLimit));
  const [includeRecommendations, setIncludeRecommendations] = useState(settings.recommendationsEnabled);
  const [useAi, setUseAi] = useState(settings.aiEnabled);

  useEffect(() => {
    setReportHandle(settings.instagramUsername);
    setReportPostLimit(String(settings.defaultPostLimit));
    setIncludeRecommendations(settings.recommendationsEnabled);
    setUseAi(settings.aiEnabled);
  }, [settings]);

  function submitReport(event: FormEvent) {
    event.preventDefault();
    onCreateReport({
      handle: reportHandle,
      postLimit: Number(reportPostLimit),
      recommendationsEnabled: includeRecommendations,
      aiEnabled: useAi,
    });
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className="space-y-6">
        <form onSubmit={submitReport} className="rounded-lg border border-body/10 bg-cream p-6">
          <h2 className="font-serif text-2xl font-bold text-body">Create report</h2>
          <p className="mt-2 font-sans text-sm leading-relaxed text-body/60">
            Create a report record, run the audit separately, then upload the finished PDF into the library.
          </p>
          <div className="mt-7 grid gap-5">
            <TextField
              label="Instagram handle"
              value={reportHandle}
              onChange={setReportHandle}
            />
            <TextField
              label="Posts to analyse"
              type="number"
              min={5}
              max={100}
              value={reportPostLimit}
              onChange={setReportPostLimit}
            />
            <label className="flex items-center gap-3 font-sans text-sm font-medium text-body/70">
              <input
                type="checkbox"
                checked={includeRecommendations}
                onChange={(event) => setIncludeRecommendations(event.target.checked)}
                className="h-5 w-5 rounded border-body/20 text-coral focus:ring-coral"
              />
              Include recommendations section
            </label>
            <label className="flex items-center gap-3 font-sans text-sm font-medium text-body/70">
              <input
                type="checkbox"
                checked={useAi}
                onChange={(event) => setUseAi(event.target.checked)}
                className="h-5 w-5 rounded border-body/20 text-coral focus:ring-coral"
              />
              Use AI recommendations
            </label>
            {!settings.hasDeepseekKey && useAi && (
              <p className="rounded-lg border border-coral/20 bg-white px-3 py-2 font-sans text-xs leading-relaxed text-coral">
                Add the DeepSeek key in Settings before AI recommendations can run.
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={saving || !reportHandle.trim()}
            className="mt-7 rounded-full bg-coral px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-off-white transition hover:bg-coral-700 disabled:opacity-40"
          >
            {saving ? "Creating..." : "Create record"}
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-body/10 bg-white">
        <div className="flex flex-col gap-4 border-b border-body/10 p-6 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="font-serif text-2xl font-bold text-body">Report library</h2>
            <p className="mt-2 font-sans text-sm text-body/60">
              Upload finished PDFs, download completed reports or delete reports that are no longer needed.
            </p>
          </div>
          <button
            type="button"
            onClick={onRefreshReports}
            className="self-start rounded-full border border-body/15 px-4 py-2 font-sans text-xs font-semibold uppercase tracking-[0.12em] text-body/60 transition hover:border-coral hover:text-coral"
          >
            Refresh
          </button>
        </div>

        {reports.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-serif text-2xl font-semibold text-body">No reports yet</p>
            <p className="mt-2 font-sans text-sm text-body/60">
              Create a report record and upload a PDF when it is ready.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-body/10">
            {reports.map((report) => (
              <div key={report.id} className="grid gap-4 p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="font-serif text-xl font-bold text-body">@{report.handle}</h3>
                    <span
                      className={`rounded-full px-3 py-1 font-sans text-xs font-semibold uppercase tracking-[0.12em] ${
                        report.status === "completed"
                          ? "bg-green-100 text-green-700"
                          : report.status === "failed"
                            ? "bg-coral/10 text-coral"
                            : "bg-body/10 text-body/55"
                      }`}
                    >
                      {report.status}
                    </span>
                  </div>
                  <p className="mt-2 font-sans text-sm text-body/60">
                    {report.postLimit} posts • {report.recommendationsEnabled ? "Recommendations on" : "Recommendations off"} •{" "}
                    {report.aiEnabled ? "AI on" : "AI off"}
                  </p>
                  <p className="mt-1 font-sans text-xs text-body/40">
                    Created {formatDate(report.createdAt)}
                    {report.completedAt ? ` • Completed ${formatDate(report.completedAt)}` : ""}
                  </p>
                  {report.errorMessage && (
                    <p className="mt-3 rounded-lg border border-coral/20 bg-coral/[0.04] px-3 py-2 font-sans text-sm text-coral">
                      {report.errorMessage}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 md:justify-end">
                  <FileUploadButton
                    label={report.status === "completed" ? "Replace PDF" : "Upload PDF"}
                    disabled={saving}
                    accept="application/pdf"
                    onFile={(file) => onUploadReport(report, file)}
                  />
                  <button
                    type="button"
                    onClick={() => onDownloadReport(report)}
                    disabled={report.status !== "completed"}
                    className="rounded-full border border-body/15 px-4 py-2 font-sans text-xs font-semibold uppercase tracking-[0.12em] text-body/60 transition hover:border-coral hover:text-coral disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteReport(report)}
                    disabled={saving}
                    className="rounded-full border border-coral/25 px-4 py-2 font-sans text-xs font-semibold uppercase tracking-[0.12em] text-coral transition hover:bg-coral hover:text-off-white disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PresenceAudits({
  runs,
  spend,
  saving,
  onCreate,
  onCancel,
  onRetry,
  onDownload,
  onRefresh,
}: {
  runs: PresenceRun[];
  spend: PresenceSpendSummary;
  saving: boolean;
  onCreate: (input: PresenceRunInput) => Promise<void>;
  onCancel: (run: PresenceRun) => Promise<void>;
  onRetry: (run: PresenceRun) => Promise<void>;
  onDownload: (run: PresenceRun) => Promise<void>;
  onRefresh: () => Promise<unknown>;
}) {
  const [company, setCompany] = useState("");
  const [website, setWebsite] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [facebook, setFacebook] = useState("");
  const [legalName, setLegalName] = useState("");
  const [area, setArea] = useState("");
  const [testMode, setTestMode] = useState(spend.defaultTestMode);
  const [testModeTouched, setTestModeTouched] = useState(false);

  useEffect(() => {
    if (!testModeTouched) setTestMode(spend.defaultTestMode);
  }, [spend.defaultTestMode, testModeTouched]);

  useEffect(() => {
    const shouldPoll = runs.some((run) => (run.status === "queued" || run.status === "running") && !run.trackingStopped);
    if (!shouldPoll) return undefined;
    const timer = window.setInterval(() => {
      onRefresh().catch(() => undefined);
    }, 8000);
    return () => window.clearInterval(timer);
  }, [runs, onRefresh]);

  const usedPercent = spend.capUsd <= 0 ? 100 : Math.min(100, (spend.monthToDateUsd / spend.capUsd) * 100);
  const realBlocked = !spend.realRunsEnabled;
  const inProgress = runs.some((run) => {
    if (run.trackingStopped || (run.status !== "queued" && run.status !== "running")) return false;
    const started = Date.parse(run.createdAt);
    return !Number.isFinite(started) || Date.now() - started <= 16 * 60 * 1000;
  });
  const canSubmit = Boolean(company.trim() && website.trim() && spend.workerConfigured) && !saving && !inProgress;

  function submit(event: FormEvent) {
    event.preventDefault();
    const handles: NonNullable<PresenceRunInput["handles"]> = {};
    if (instagram.trim()) handles.instagram = instagram.trim();
    if (tiktok.trim()) handles.tiktok = tiktok.trim();
    if (facebook.trim()) handles.facebook = facebook.trim();
    onCreate({
      company,
      website,
      ...(Object.keys(handles).length > 0 ? { handles } : {}),
      ...(legalName.trim() ? { business: legalName.trim() } : {}),
      ...(area.trim() ? { area: area.trim() } : {}),
      testMode,
    }).catch(() => undefined);
  }

  return (
    <div className="mt-8">
      <div className="rounded-lg border border-body/10 bg-white p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-coral">This month</p>
            <p className="mt-2 font-serif text-3xl font-bold text-body">
              {formatUsd(spend.monthToDateUsd)}{" "}
              <span className="font-sans text-base font-medium text-body/50">of {formatUsd(spend.capUsd)}</span>
            </p>
            <p className="mt-2 max-w-2xl font-sans text-sm leading-relaxed text-body/60">
              A real run reserves {formatUsd(spend.estimatePerRunUsd)} until the worker reports cost in USD.
              That reservation is released if the run fails, times out, or tracking is stopped, and it is replaced when the worker reports the actual cost.
              Free test runs use sample data, cost {formatUsd(0)}, and are never blocked by the cap.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              onRefresh().catch(() => undefined);
            }}
            className="self-start rounded-full border border-body/15 px-4 py-2 font-sans text-xs font-semibold uppercase tracking-[0.12em] text-body/60 transition hover:border-coral hover:text-coral"
          >
            Refresh
          </button>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-body/10" aria-hidden="true">
          <div className="h-full rounded-full bg-coral" style={{ width: `${usedPercent}%` }} />
        </div>
        {!spend.workerConfigured && (
          <p className="mt-4 rounded-lg border border-body/10 bg-cream px-3 py-2 font-sans text-sm leading-relaxed text-body/70">
            The audit worker is not on this stack yet. Deploy with FIRST_LIGHT_AUDIT_WORKER_IMAGE_TAG before starting a run.
          </p>
        )}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[380px_minmax(0,1fr)]">
        <form onSubmit={submit} className="rounded-lg border border-body/10 bg-cream p-6">
          <h2 className="font-serif text-2xl font-bold text-body">New presence audit</h2>
          <p className="mt-2 font-sans text-sm leading-relaxed text-body/60">
            Company and an https website. Instagram, TikTok, and Facebook are optional. A PDF is ready to download only when the audit succeeds.
          </p>
          <div className="mt-7 grid gap-5">
            <TextField label="Company" value={company} onChange={setCompany} />
            <TextField label="Website" value={website} onChange={setWebsite} />
            <TextField label="Instagram" value={instagram} onChange={setInstagram} />
            <TextField label="TikTok" value={tiktok} onChange={setTiktok} />
            <TextField label="Facebook" value={facebook} onChange={setFacebook} />
            <TextField label="Legal name (optional)" value={legalName} onChange={setLegalName} />
            <TextField label="Area (optional)" value={area} onChange={setArea} />
            <label className="rounded-lg border border-coral/25 bg-white px-4 py-3">
              <span className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={testMode}
                  onChange={(event) => {
                    setTestModeTouched(true);
                    setTestMode(event.target.checked);
                  }}
                  className="mt-1 h-5 w-5 rounded border-body/20 text-coral focus:ring-coral"
                />
                <span>
                  <span className="block font-sans text-sm font-semibold text-body">Free test run</span>
                  <span className="mt-1 block font-sans text-xs leading-relaxed text-body/60">
                    On by default. The worker stays offline: sample data, no Apify, and no AI charge.
                    {realBlocked
                      ? " Real runs are switched off on this stack until FIRST_LIGHT_AUDIT_WORKER_ALLOW_REAL=true."
                      : ` Turn this off to start a real audit, estimated at ${formatUsd(spend.estimatePerRunUsd)}.`}
                  </span>
                </span>
              </span>
            </label>
            {!testMode && realBlocked && (
              <p className="rounded-lg border border-coral/20 bg-white px-3 py-2 font-sans text-xs leading-relaxed text-coral">
                This stack will refuse the run. Leave the free test run on.
              </p>
            )}
            {inProgress && (
              <p className="rounded-lg border border-coral/20 bg-white px-3 py-2 font-sans text-xs leading-relaxed text-coral">
                A run is already in progress.
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={!canSubmit || (!testMode && realBlocked)}
            className="mt-7 rounded-full bg-coral px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-off-white transition hover:bg-coral-700 disabled:opacity-40"
          >
            {saving ? "Starting..." : testMode ? "Start free test" : "Start real audit"}
          </button>
        </form>

        <div className="overflow-hidden rounded-lg border border-body/10 bg-white">
          <div className="border-b border-body/10 p-6">
            <h2 className="font-serif text-2xl font-bold text-body">Runs</h2>
            <p className="mt-2 font-sans text-sm text-body/60">
              Status updates every few seconds while a run is queued or in progress.
            </p>
          </div>
          {runs.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-serif text-2xl font-semibold text-body">No presence audits yet</p>
              <p className="mt-2 font-sans text-sm text-body/60">Start with a free test run. It does not count towards the cap.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left">
                <thead>
                  <tr className="border-b border-body/10 font-sans text-xs font-semibold uppercase tracking-[0.14em] text-body/45">
                    <th className="px-6 py-3 font-semibold">Business</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Detail</th>
                    <th className="px-4 py-3 font-semibold">Cost</th>
                    <th className="px-4 py-3 font-semibold">Started</th>
                    <th className="px-6 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => {
                    const handleLine = [run.handles.instagram, run.handles.tiktok, run.handles.facebook].filter(Boolean).join(" · ");
                    const open = (run.status === "queued" || run.status === "running") && !run.trackingStopped;
                    const canRetry = run.status === "failed" || run.status === "cancelled" || run.status === "needs_review";
                    return (
                      <tr key={run.id} className="border-b border-body/10 align-top last:border-b-0">
                        <td className="px-6 py-4">
                          <p className="font-serif text-lg font-bold text-body">{run.company}</p>
                          <a
                            href={run.website}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 block max-w-[220px] truncate font-sans text-xs text-body/50 underline-offset-2 hover:text-coral hover:underline"
                          >
                            {run.website}
                          </a>
                          {handleLine && (
                            <p className="mt-1 max-w-[220px] truncate font-sans text-xs text-body/45">{handleLine}</p>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 font-sans text-xs font-semibold uppercase tracking-[0.12em] ${presenceStatusClass(run)}`}
                          >
                            {run.statusLabel}
                          </span>
                          {run.testMode && (
                            <p className="mt-2 font-sans text-xs text-body/45">Free test</p>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <p className="max-w-[220px] font-sans text-xs leading-relaxed text-body/55">{run.statusMessage}</p>
                        </td>
                        <td className="px-4 py-4">
                          <p className="font-sans text-sm font-semibold text-body">{presenceCostText(run)}</p>
                          {run.costLabel !== "Free" && (
                            <p className="mt-1 font-sans text-xs uppercase tracking-[0.12em] text-body/40">{run.costLabel}</p>
                          )}
                        </td>
                        <td className="px-4 py-4 font-sans text-sm text-body/60">{formatDate(run.createdAt)}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => onDownload(run)}
                              disabled={!run.downloadReady || saving}
                              className="rounded-full border border-body/15 px-3 py-2 font-sans text-xs font-semibold uppercase tracking-[0.12em] text-body/60 transition hover:border-coral hover:text-coral disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Download
                            </button>
                            {open && (
                              <button
                                type="button"
                                onClick={() => onCancel(run)}
                                disabled={saving}
                                className="rounded-full border border-coral/25 px-3 py-2 font-sans text-xs font-semibold uppercase tracking-[0.12em] text-coral transition hover:bg-coral hover:text-off-white disabled:opacity-40"
                              >
                                Stop tracking
                              </button>
                            )}
                            {canRetry && (
                              <button
                                type="button"
                                onClick={() => onRetry(run)}
                                disabled={saving || !spend.workerConfigured}
                                className="rounded-full border border-body/15 px-3 py-2 font-sans text-xs font-semibold uppercase tracking-[0.12em] text-body/60 transition hover:border-coral hover:text-coral disabled:opacity-40"
                              >
                                Retry
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function presenceStatusClass(run: PresenceRun) {
  if (run.trackingStopped && (run.status === "queued" || run.status === "running")) return "bg-body/10 text-body/55";
  if (run.status === "succeeded") return "bg-green-100 text-green-700";
  if (run.status === "needs_review") return "bg-amber-100 text-amber-800";
  if (run.status === "failed" || run.status === "cancelled") return "bg-coral/10 text-coral";
  if (run.status === "running") return "bg-amber-100 text-amber-800";
  return "bg-body/10 text-body/55";
}

function presenceCostText(run: PresenceRun) {
  if (run.costLabel === "Free") return "Free";
  if (run.costLabel === "Actual" && typeof run.costUsd === "number") return formatUsd(run.costUsd);
  if (run.costLabel === "Released") return formatUsd(0);
  return formatUsd(run.estimatedCostUsd);
}

function formatUsd(amount: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function BlogEditor({
  content,
  posts,
  mediaAssets,
  editingPost,
  saving,
  uploading,
  onContentChange,
  onSaveSettings,
  onPostChange,
  onPostSubmit,
  onEditPost,
  onNewPost,
  onDeletePost,
  onUploadMedia,
}: {
  content: ManagedSiteContent;
  posts: BlogPost[];
  mediaAssets: MediaAsset[];
  editingPost: BlogPost;
  saving: boolean;
  uploading: boolean;
  onContentChange: (content: ManagedSiteContent) => void;
  onSaveSettings: (event: FormEvent) => void;
  onPostChange: (post: BlogPost) => void;
  onPostSubmit: (event: FormEvent) => void;
  onEditPost: (post: BlogPost) => void;
  onNewPost: () => void;
  onDeletePost: (post: BlogPost) => void;
  onUploadMedia: (file: File) => Promise<MediaAsset>;
}) {
  function updatePost(field: keyof BlogPost, value: string) {
    const next = { ...editingPost, [field]: value };
    if (field === "title" && !editingPost.slug.trim()) {
      next.slug = slugify(value);
    }
    onPostChange(next);
  }

  async function uploadCover(file: File) {
    const asset = await onUploadMedia(file);
    onPostChange({
      ...editingPost,
      coverImage: asset.url,
      coverAlt: editingPost.coverAlt.trim() || asset.fileName.replace(/\.[^.]+$/, ""),
    });
  }

  async function uploadInlineImage(file: File) {
    const asset = await onUploadMedia(file);
    const altText = asset.fileName.replace(/\.[^.]+$/, "");
    updatePost("body", `${editingPost.body.trim()}\n\n![${altText}](${asset.url})`.trim());
  }

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-6">
        <form onSubmit={onSaveSettings} className="rounded-lg border border-body/10 bg-white p-5">
          <h2 className="font-serif text-xl font-bold text-body">Blog settings</h2>
          <label className="mt-5 flex items-center gap-3 font-sans text-sm font-medium text-body/70">
            <input
              type="checkbox"
              checked={content.settings.blogEnabled}
              onChange={(event) =>
                onContentChange({
                  ...content,
                  settings: { ...content.settings, blogEnabled: event.target.checked },
                })
              }
              className="h-5 w-5 rounded border-body/20 text-coral focus:ring-coral"
            />
            Blog visible on site
          </label>
          <div className="mt-5">
            <TextField
              label="Substack URL"
              value={content.settings.substackUrl}
              onChange={(value) =>
                onContentChange({
                  ...content,
                  settings: { ...content.settings, substackUrl: value },
                })
              }
            />
            <p className="mt-2 font-sans text-xs leading-relaxed text-body/45">
              Paste the publication URL, for example https://firstlightmarketing.substack.com.
            </p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="mt-5 rounded-full bg-coral px-5 py-2.5 font-sans text-xs font-semibold uppercase tracking-wider text-off-white disabled:opacity-40"
          >
            Save settings
          </button>
        </form>

        <div className="rounded-lg border border-body/10 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-serif text-xl font-bold text-body">Posts</h2>
            <button type="button" onClick={onNewPost} className="font-sans text-xs font-semibold uppercase tracking-wider text-coral">
              New
            </button>
          </div>
          <div className="mt-5 space-y-3">
            {posts.length === 0 && <p className="font-sans text-sm text-body/55">No posts yet.</p>}
            {posts.map((post) => (
              <button
                key={post.slug}
                type="button"
                onClick={() => onEditPost(post)}
                className={`block w-full rounded-lg border p-4 text-left transition ${
                  editingPost.slug === post.slug ? "border-coral bg-coral/5" : "border-body/10 hover:border-coral/30"
                }`}
              >
                <span className="block font-sans text-xs font-semibold uppercase tracking-[0.14em] text-body/40">
                  {post.status}
                </span>
                <span className="mt-2 block font-sans text-sm font-semibold text-body">{post.title || "Untitled post"}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-body/10 bg-white p-5">
          <h2 className="font-serif text-xl font-bold text-body">Recent media</h2>
          <p className="mt-2 font-sans text-sm text-body/55">
            Reuse uploaded image URLs in covers or Markdown.
          </p>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {mediaAssets.slice(0, 6).map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => updatePost("coverImage", asset.url)}
                className="group overflow-hidden rounded-lg border border-body/10 bg-cream text-left transition hover:border-coral/40"
                title="Use as cover image"
              >
                <img src={asset.url} alt={asset.fileName} className="aspect-square w-full object-cover" />
                <span className="block truncate px-2 py-2 font-sans text-xs text-body/55 group-hover:text-coral">
                  {asset.fileName}
                </span>
              </button>
            ))}
          </div>
          {mediaAssets.length === 0 && (
            <p className="mt-4 font-sans text-sm text-body/50">No uploads yet.</p>
          )}
        </div>
      </div>

      <form onSubmit={onPostSubmit} className="rounded-lg border border-body/10 bg-white p-6">
        <div className="flex flex-col gap-4 border-b border-body/10 pb-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-serif text-2xl font-bold text-body">Blog post</h2>
            <p className="mt-2 font-sans text-sm text-body/60">
              Use Markdown for formatting. Images work as <code>![Alt text](https://image-url)</code>.
            </p>
          </div>
          {editingPost.slug && (
            <button
              type="button"
              onClick={() => onDeletePost(editingPost)}
              className="self-start rounded-full border border-coral/25 px-4 py-2 font-sans text-xs font-semibold uppercase tracking-wider text-coral hover:bg-coral hover:text-off-white"
            >
              Delete
            </button>
          )}
        </div>

        <div className="mt-6 grid gap-5">
          <TextField label="Title" value={editingPost.title} onChange={(value) => updatePost("title", value)} />
          <TextField label="Slug" value={editingPost.slug} onChange={(value) => updatePost("slug", slugify(value))} />
          <label className="block font-sans text-sm font-medium text-body/70">
            Status
            <select
              value={editingPost.status}
              onChange={(event) => updatePost("status", event.target.value)}
              className="mt-2 block w-full rounded-lg border border-body/15 bg-white px-4 py-3 font-sans text-base text-body focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/20"
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </select>
          </label>
          <label className="block font-sans text-sm font-medium text-body/70">
            Excerpt
            <textarea
              value={editingPost.excerpt}
              onChange={(event) => updatePost("excerpt", event.target.value)}
              rows={3}
              className="mt-2 block w-full rounded-lg border border-body/15 bg-white px-4 py-3 font-sans text-base text-body focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/20"
            />
          </label>
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <TextField label="Cover image URL" value={editingPost.coverImage} onChange={(value) => updatePost("coverImage", value)} />
              <FileUploadButton
                label={uploading ? "Uploading cover..." : "Upload cover image"}
                disabled={uploading}
                onFile={uploadCover}
              />
            </div>
            <TextField label="Cover image alt text" value={editingPost.coverAlt} onChange={(value) => updatePost("coverAlt", value)} />
          </div>
          <label className="block font-sans text-sm font-medium text-body/70">
            Body
            <textarea
              value={editingPost.body}
              onChange={(event) => updatePost("body", event.target.value)}
              rows={14}
              placeholder={"## Heading\n\nWrite your post here.\n\n![Alt text](https://example.com/image.jpg)"}
              className="mt-2 block w-full rounded-lg border border-body/15 bg-white px-4 py-3 font-mono text-sm leading-relaxed text-body focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/20"
            />
          </label>
          <FileUploadButton
            label={uploading ? "Uploading image..." : "Upload and insert image"}
            disabled={uploading}
            onFile={uploadInlineImage}
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="mt-8 rounded-full bg-coral px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-off-white transition hover:bg-coral-700 disabled:opacity-40"
        >
          {saving ? "Saving..." : editingPost.status === "published" ? "Save and publish" : "Save draft"}
        </button>
      </form>
    </div>
  );
}

function MediaLibrary({
  assets,
  uploading,
  onUploadMedia,
}: {
  assets: MediaAsset[];
  uploading: boolean;
  onUploadMedia: (file: File) => Promise<MediaAsset>;
}) {
  return (
    <div className="mt-8">
      <div className="flex flex-col gap-4 rounded-lg border border-body/10 bg-white p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="font-serif text-2xl font-bold text-body">Media library</h2>
          <p className="mt-2 font-sans text-sm text-body/60">
            Upload images once and reuse their CloudFront URLs across blog posts, case studies and page content.
          </p>
        </div>
        <FileUploadButton
          label={uploading ? "Uploading..." : "Upload image"}
          disabled={uploading}
          onFile={onUploadMedia}
        />
      </div>

      {assets.length === 0 ? (
        <div className="mt-6 rounded-lg border border-body/10 bg-white p-8 text-center">
          <p className="font-serif text-2xl font-semibold text-body">No media yet</p>
          <p className="mt-2 font-sans text-sm text-body/60">
            Uploaded images will appear here with reusable URLs.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => (
            <article key={asset.id} className="overflow-hidden rounded-lg border border-body/10 bg-white">
              <img src={asset.url} alt={asset.fileName} className="aspect-[4/3] w-full object-cover" />
              <div className="p-4">
                <p className="truncate font-sans text-sm font-semibold text-body">{asset.fileName}</p>
                <p className="mt-1 font-sans text-xs text-body/45">{formatDate(asset.createdAt)}</p>
                <input
                  readOnly
                  value={asset.url}
                  onFocus={(event) => event.currentTarget.select()}
                  className="mt-3 block w-full rounded-md border border-body/10 bg-cream px-3 py-2 font-mono text-xs text-body/60"
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function FileUploadButton({
  label,
  disabled,
  accept = "image/jpeg,image/png,image/webp,image/gif",
  onFile,
}: {
  label: string;
  disabled: boolean;
  accept?: string;
  onFile: (file: File) => Promise<unknown>;
}) {
  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await onFile(file).catch(() => undefined);
  }

  return (
    <label
      className={`inline-flex cursor-pointer rounded-full border px-5 py-2.5 font-sans text-xs font-semibold uppercase tracking-wider transition ${
        disabled
          ? "pointer-events-none border-body/10 text-body/35"
          : "border-coral/30 text-coral hover:bg-coral hover:text-off-white"
      }`}
    >
      {label}
      <input
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={handleFileChange}
        className="sr-only"
      />
    </label>
  );
}

function TextField({
  label,
  value,
  type = "text",
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  type?: "text" | "number" | "password";
  min?: number;
  max?: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block font-sans text-sm font-medium text-body/70">
      {label}
      <input
        type={type}
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 block w-full rounded-lg border border-body/15 bg-white px-4 py-3 font-sans text-base text-body focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/20"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  rows,
  onChange,
}: {
  label: string;
  value: string;
  rows: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block font-sans text-sm font-medium text-body/70">
      {label}
      <textarea
        value={value}
        rows={rows}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 block w-full rounded-lg border border-body/15 bg-white px-4 py-3 font-sans text-base leading-relaxed text-body focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/20"
      />
    </label>
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatDate(value?: string) {
  if (!value) return "Unknown";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
