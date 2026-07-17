import { useState, FormEvent } from "react";
import { SERVICES } from "../content/services";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Shared input styles (matching ContactForm.tsx)
// ---------------------------------------------------------------------------
const inputClass =
  "mt-1.5 block w-full rounded-xl border border-body/15 bg-white/70 px-4 py-3 font-sans text-base text-body placeholder:text-body/30 focus:border-coral focus:outline-none focus:ring-2 focus:ring-coral/20 transition";
const labelClass = "block font-sans text-sm font-medium text-body/70";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function LeadForm() {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Step 1 state
  const [servicesNeeded, setServicesNeeded] = useState<string[]>([]);
  const [challenge, setChallenge] = useState("");
  const [challengeOther, setChallengeOther] = useState("");
  const [budgetRange, setBudgetRange] = useState("");

  // Step 2 state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [business, setBusiness] = useState("");
  const [comments, setComments] = useState("");

  const step1Valid = servicesNeeded.length > 0 && challenge !== "" && budgetRange !== "";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
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

    // Simulate a brief send
    setTimeout(() => {
      setSubmitting(false);
      setSuccess(true);
    }, 600);
  }

  // ------------------------------------------------------------------
  // Success state
  // ------------------------------------------------------------------
  if (success) {
    return (
      <div className="rounded-2xl border border-coral/20 bg-coral/[0.03] p-8 text-center">
        <p className="mb-2 font-serif text-2xl font-semibold text-body">
          Thanks for reaching out!
        </p>
        <p className="font-sans text-base text-body/60">
          I'll get back to you as soon as I can.
        </p>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Progress indicator
  // ------------------------------------------------------------------
  const progress = (
    <div className="mb-8 flex items-center justify-center gap-2">
      <div
        className={`h-2 w-10 rounded-full transition-colors ${
          step === 1 ? "bg-coral" : "bg-coral/20"
        }`}
      />
      <div
        className={`h-2 w-10 rounded-full transition-colors ${
          step === 2 ? "bg-coral" : "bg-coral/20"
        }`}
      />
      <span className="ml-2 font-sans text-xs font-medium text-body/50">
        Step {step} of 2
      </span>
    </div>
  );

  // ------------------------------------------------------------------
  // Step 1 — Qualifying questions
  // ------------------------------------------------------------------
  if (step === 1) {
    return (
      <div>
        {progress}
        <p className="mb-8 text-center font-sans text-sm text-body/50">
          Let&rsquo;s see if we&rsquo;re a good fit
        </p>

        {/* Q1: Services needed */}
        <div className="mb-8">
          <p className={labelClass}>What do you need help with?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[...SERVICES.map((s) => s.title), "Not sure yet"].map((opt) => {
              const selected = servicesNeeded.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() =>
                    setServicesNeeded((prev) =>
                      prev.includes(opt)
                        ? prev.filter((s) => s !== opt)
                        : [...prev, opt]
                    )
                  }
                  className={`rounded-full border px-4 py-2 font-sans text-sm transition-all ${
                    selected
                      ? "border-coral bg-coral text-off-white"
                      : "border-body/15 bg-white/40 text-body/70 hover:border-coral/40"
                  }`}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>

        {/* Q2: Biggest challenge */}
        <fieldset className="mb-8">
          <legend className={labelClass}>
            What&rsquo;s the biggest challenge you&rsquo;re facing right now?
          </legend>
          <div className="mt-3 space-y-2">
            {CHALLENGES.map((opt) => (
              <label
                key={opt}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-all ${
                  challenge === opt
                    ? "border-coral bg-coral/5"
                    : "border-body/10 bg-white/40 hover:border-coral/30"
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
                    challenge === opt
                      ? "border-coral bg-coral"
                      : "border-body/20"
                  }`}
                >
                  {challenge === opt && (
                    <span className="h-2 w-2 rounded-full bg-white" />
                  )}
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
        </fieldset>

        {/* Q3: Budget */}
        <fieldset className="mb-8">
          <legend className={labelClass}>
            What&rsquo;s your budget?
          </legend>
          <div className="mt-3 space-y-2">
            {BUDGETS.map((opt) => (
              <label
                key={opt}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-all ${
                  budgetRange === opt
                    ? "border-coral bg-coral/5"
                    : "border-body/10 bg-white/40 hover:border-coral/30"
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
                    budgetRange === opt
                      ? "border-coral bg-coral"
                      : "border-body/20"
                  }`}
                >
                  {budgetRange === opt && (
                    <span className="h-2 w-2 rounded-full bg-white" />
                  )}
                </span>
                <span className="font-sans text-sm text-body/80">{opt}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Continue button */}
        <button
          type="button"
          disabled={!step1Valid}
          onClick={() => setStep(2)}
          className="w-full rounded-full bg-coral px-6 py-3.5 font-sans text-base font-semibold uppercase tracking-wider text-off-white transition-all hover:bg-coral-700 hover:shadow-lg disabled:opacity-40"
        >
          Continue
        </button>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Step 2 — Contact details
  // ------------------------------------------------------------------
  return (
    <form onSubmit={handleSubmit}>
      {progress}

      <div className="space-y-5">
        <div>
          <label htmlFor="lead-name" className={labelClass}>
            Name <span className="text-coral">*</span>
          </label>
          <input
            id="lead-name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="Your name"
          />
        </div>

        <div>
          <label htmlFor="lead-email" className={labelClass}>
            Email <span className="text-coral">*</span>
          </label>
          <input
            id="lead-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="lead-business" className={labelClass}>
            Business name
          </label>
          <input
            id="lead-business"
            type="text"
            value={business}
            onChange={(e) => setBusiness(e.target.value)}
            className={inputClass}
            placeholder="Optional"
          />
        </div>

        <div>
          <label htmlFor="lead-comments" className={labelClass}>
            Additional comments
          </label>
          <textarea
            id="lead-comments"
            rows={4}
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            className={`${inputClass} resize-y`}
            placeholder="Anything else I should know?"
          />
        </div>
      </div>

      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={() => setStep(1)}
          className="rounded-full border-2 border-body/15 px-6 py-3.5 font-sans text-sm font-semibold uppercase tracking-wider text-body/60 transition-all hover:border-body/30 hover:text-body"
        >
          Back
        </button>
        <button
          type="submit"
          disabled={submitting || !name.trim() || !email.trim()}
          className="flex-1 rounded-full bg-coral px-6 py-3.5 font-sans text-base font-semibold uppercase tracking-wider text-off-white transition-all hover:bg-coral-700 hover:shadow-lg disabled:opacity-40"
        >
          {submitting ? "Sending..." : "Send"}
        </button>
      </div>
    </form>
  );
}
