import { useState } from "react";
import { SERVICES } from "../content/services";

interface LeadSubmission {
  servicesNeeded: string[];
  challenge: string;
  challengeOther?: string;
  budgetRange: string;
  name: string;
  email: string;
  business?: string;
  comments?: string;
}

const CHALLENGES = [
  "Not generating enough leads",
  "No time for marketing",
  "Inconsistent content / social media",
  "Don't know where to start",
  "Have a plan, need help executing it",
  "Other",
] as const;

const BUDGETS = [
  "Under £500/month",
  "£500–£1,500/month",
  "£1,500+/month",
  "One-off project",
  "Not sure yet",
] as const;

const TOTAL_STEPS = 4;

const inputClass =
  "mt-1.5 block w-full rounded-xl border border-body/15 bg-white/90 px-4 py-3 font-sans text-base text-body placeholder:text-body/30 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/20 transition";
const labelClass = "block font-sans text-sm font-medium text-body/70";

export function LeadFormCard() {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [servicesNeeded, setServicesNeeded] = useState<string[]>([]);
  const [challenge, setChallenge] = useState("");
  const [challengeOther, setChallengeOther] = useState("");
  const [budgetRange, setBudgetRange] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [business, setBusiness] = useState("");
  const [comments, setComments] = useState("");

  const canAdvance = (s: number): boolean => {
    switch (s) {
      case 0: return servicesNeeded.length > 0;
      case 1: return challenge !== "";
      case 2: return budgetRange !== "";
      default: return false;
    }
  };

  function next() {
    if (step < TOTAL_STEPS - 1) setStep(step + 1);
  }
  function prev() {
    if (step > 0) setStep(step - 1);
  }

  function handleSubmit() {
    setSubmitting(true);
    const data: LeadSubmission = {
      servicesNeeded,
      challenge,
      challengeOther: challenge === "Other" ? challengeOther : undefined,
      budgetRange,
      name: name.trim(),
      email: email.trim(),
      business: business.trim() || undefined,
      comments: comments.trim() || undefined,
    };
    // TODO: wire to backend once the lead-capture Lambda/DynamoDB schema is extended
    console.log("Lead submission:", data);
    setTimeout(() => {
      setSubmitting(false);
      setDone(true);
    }, 600);
  }

  // ── Success ──
  if (done) {
    return (
      <div className="mx-auto max-w-md rounded-2xl bg-white p-8 text-center shadow-lg">
        <p className="font-serif text-2xl font-semibold text-body">Thanks for reaching out!</p>
        <p className="mt-2 font-sans text-base text-body/60">I&rsquo;ll get back to you as soon as I can.</p>
      </div>
    );
  }

  // ── Progress dots ──
  const dots = (
    <div className="mb-6 flex items-center justify-center gap-1.5">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all duration-300 ${
            i <= step ? "w-6 bg-coral" : "w-2 bg-body/15"
          }`}
        />
      ))}
    </div>
  );

  // ── Card wrapper ──
  const card = (children: React.ReactNode) => (
    <div className="mx-auto max-w-md rounded-2xl bg-white p-8 shadow-lg">
      {dots}
      {children}
    </div>
  );

  // ── Footer: continue/back + submit ──
  function Footer() {
    if (step < TOTAL_STEPS - 1) {
      return (
        <div className="mt-8 flex gap-3">
          {step > 0 && (
            <button onClick={prev} className="rounded-full border-2 border-body/15 px-5 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-body/50 transition-all hover:border-body/30 hover:text-body">
              Back
            </button>
          )}
          <button
            onClick={next}
            disabled={!canAdvance(step)}
            className="flex-1 rounded-full bg-coral px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-off-white transition-all hover:bg-coral-700 hover:shadow-lg disabled:opacity-40"
          >
            Continue
          </button>
        </div>
      );
    }
    return (
      <div className="mt-8 flex gap-3">
        <button onClick={prev} className="rounded-full border-2 border-body/15 px-5 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-body/50 transition-all hover:border-body/30 hover:text-body">
          Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting || !name.trim() || !email.trim()}
          className="flex-1 rounded-full bg-coral px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-off-white transition-all hover:bg-coral-700 hover:shadow-lg disabled:opacity-40"
        >
          {submitting ? "Sending..." : "Send"}
        </button>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // Step 0 — What do you need help with?
  // ══════════════════════════════════════════════════════════════
  if (step === 0) {
    return card(
      <>
        <p className="mb-6 font-serif text-xl font-semibold text-body">What do you need help with?</p>
        <div className="flex flex-wrap gap-2">
          {[...SERVICES.map((s) => s.title), "Not sure yet"].map((opt) => {
            const selected = servicesNeeded.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() =>
                  setServicesNeeded((prev) =>
                    prev.includes(opt) ? prev.filter((s) => s !== opt) : [...prev, opt]
                  )
                }
                className={`rounded-full border px-4 py-2 font-sans text-sm transition-all ${
                  selected
                    ? "border-coral bg-coral text-off-white"
                    : "border-body/15 bg-body/[0.03] text-body/70 hover:border-coral/40"
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
        <Footer />
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // Step 1 — Biggest challenge
  // ══════════════════════════════════════════════════════════════
  if (step === 1) {
    return card(
      <>
        <p className="mb-6 font-serif text-xl font-semibold text-body">
          What&rsquo;s the biggest challenge you&rsquo;re facing?
        </p>
        <div className="space-y-2">
          {CHALLENGES.map((opt) => (
            <label
              key={opt}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-all ${
                challenge === opt
                  ? "border-coral bg-coral/5"
                  : "border-body/10 bg-body/[0.02] hover:border-coral/30"
              }`}
            >
              <input
                type="radio"
                name="challenge"
                value={opt}
                checked={challenge === opt}
                onChange={(e) => setChallenge(e.target.value)}
                className="sr-only"
              />
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  challenge === opt ? "border-coral bg-coral" : "border-body/20"
                }`}
              >
                {challenge === opt && <span className="h-2 w-2 rounded-full bg-white" />}
              </span>
              <span className="font-sans text-sm text-body/80">{opt}</span>
            </label>
          ))}
        </div>
        {challenge === "Other" && (
          <input
            type="text"
            value={challengeOther}
            onChange={(e) => setChallengeOther(e.target.value)}
            placeholder="Tell me more..."
            className={`${inputClass} mt-2`}
          />
        )}
        <Footer />
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // Step 2 — Budget
  // ══════════════════════════════════════════════════════════════
  if (step === 2) {
    return card(
      <>
        <p className="mb-6 font-serif text-xl font-semibold text-body">What&rsquo;s your budget?</p>
        <div className="space-y-2">
          {BUDGETS.map((opt) => (
            <label
              key={opt}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-all ${
                budgetRange === opt
                  ? "border-coral bg-coral/5"
                  : "border-body/10 bg-body/[0.02] hover:border-coral/30"
              }`}
            >
              <input
                type="radio"
                name="budget"
                value={opt}
                checked={budgetRange === opt}
                onChange={(e) => setBudgetRange(e.target.value)}
                className="sr-only"
              />
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                  budgetRange === opt ? "border-coral bg-coral" : "border-body/20"
                }`}
              >
                {budgetRange === opt && <span className="h-2 w-2 rounded-full bg-white" />}
              </span>
              <span className="font-sans text-sm text-body/80">{opt}</span>
            </label>
          ))}
        </div>
        <Footer />
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // Step 3 — Contact details
  // ══════════════════════════════════════════════════════════════
  return card(
    <>
      <p className="mb-6 font-serif text-xl font-semibold text-body">Almost there. How can I reach you?</p>
      <div className="space-y-4">
        <div>
          <label htmlFor="card-name" className={labelClass}>Name <span className="text-coral">*</span></label>
          <input id="card-name" type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="Your name" />
        </div>
        <div>
          <label htmlFor="card-email" className={labelClass}>Email <span className="text-coral">*</span></label>
          <input id="card-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="you@example.com" />
        </div>
        <div>
          <label htmlFor="card-business" className={labelClass}>Business name</label>
          <input id="card-business" type="text" value={business} onChange={(e) => setBusiness(e.target.value)} className={inputClass} placeholder="Optional" />
        </div>
        <div>
          <label htmlFor="card-comments" className={labelClass}>Additional comments</label>
          <textarea id="card-comments" rows={3} value={comments} onChange={(e) => setComments(e.target.value)} className={`${inputClass} resize-y`} placeholder="Anything else?" />
        </div>
      </div>
      <Footer />
    </>
  );
}
