import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";

const PROMPT_SEEN_KEY = "first-light-exit-prompt-seen";
const FORM_SUBMITTED_KEY = "first-light-lead-submitted";

export function ExitIntentPrompt() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (shouldSkip(location.pathname)) return;
    if (window.sessionStorage.getItem(PROMPT_SEEN_KEY)) return;
    if (window.sessionStorage.getItem(FORM_SUBMITTED_KEY)) return;

    let armed = false;
    let mobileScrollTriggered = false;
    const armTimer = window.setTimeout(() => {
      armed = true;
    }, 6000);

    function showPrompt() {
      if (!armed || open) return;
      if (window.sessionStorage.getItem(PROMPT_SEEN_KEY)) return;
      if (window.sessionStorage.getItem(FORM_SUBMITTED_KEY)) return;

      window.sessionStorage.setItem(PROMPT_SEEN_KEY, "true");
      setOpen(true);
    }

    function handleMouseOut(event: MouseEvent) {
      if (event.clientY <= 8 && !event.relatedTarget) showPrompt();
    }

    function handleScroll() {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;

      const progress = window.scrollY / scrollable;
      if (!mobileScrollTriggered && progress > 0.55 && window.innerWidth < 768) {
        mobileScrollTriggered = true;
        window.setTimeout(showPrompt, 1200);
      }
    }

    document.addEventListener("mouseout", handleMouseOut);
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.clearTimeout(armTimer);
      document.removeEventListener("mouseout", handleMouseOut);
      window.removeEventListener("scroll", handleScroll);
    };
  }, [location.pathname, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end bg-body/35 px-4 py-5 backdrop-blur-sm sm:items-center sm:justify-center">
      <div className="w-full max-w-md rounded-lg bg-cream p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-coral">
              Start here
            </p>
            <h2 className="mt-3 font-serif text-2xl font-bold leading-tight text-body">
              Not sure what support you need?
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-body/15 font-sans text-xl text-body/55 transition hover:border-coral hover:text-coral"
            aria-label="Close prompt"
          >
            ×
          </button>
        </div>

        <p className="mt-4 font-sans text-base leading-relaxed text-body/65">
          Answer four quick questions and Niamh can point you towards the best
          next step.
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            to="/contact"
            onClick={() => setOpen(false)}
            className="inline-flex justify-center rounded-full bg-coral px-5 py-3 font-sans text-xs font-semibold uppercase tracking-wider text-off-white transition hover:bg-coral-700"
          >
            Start the questionnaire
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex justify-center rounded-full border border-body/15 px-5 py-3 font-sans text-xs font-semibold uppercase tracking-wider text-body/55 transition hover:border-coral hover:text-coral"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}

function shouldSkip(pathname: string) {
  return pathname.startsWith("/admin") || pathname.startsWith("/contact");
}

export function markLeadSubmitted() {
  window.sessionStorage.setItem(FORM_SUBMITTED_KEY, "true");
}
