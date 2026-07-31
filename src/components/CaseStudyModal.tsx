import { useEffect } from "react";
import { Link } from "react-router-dom";
import type { CaseStudy } from "../content/work";

function CaseStudyLogo({ study }: { study: CaseStudy }) {
  return (
    <div className="flex h-28 items-center justify-center overflow-hidden rounded-lg bg-off-white px-6 py-5 shadow-sm">
      {study.logos ? (
        <div className="grid grid-cols-2 items-center justify-items-center gap-4">
          {study.logos.map((logo) => (
            <img
              key={logo.alt}
              src={logo.src}
              alt={logo.alt}
              className="max-h-8 w-auto max-w-[90px] object-contain"
            />
          ))}
        </div>
      ) : study.logo ? (
        <img
          src={study.logo}
          alt={study.client}
          className="max-h-12 w-auto max-w-[145px] object-contain"
        />
      ) : study.logoLabel ? (
        <span className="text-center font-serif text-2xl font-semibold leading-tight text-coral">
          {study.logoLabel}
        </span>
      ) : (
        <span className="font-serif text-2xl font-semibold text-coral">
          First Light
        </span>
      )}
    </div>
  );
}

export function CaseStudyModal({
  study,
  onClose,
}: {
  study: CaseStudy;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-body/70 px-4 py-6 backdrop-blur-md md:py-10"
      role="dialog"
      aria-modal="true"
      aria-labelledby="case-study-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-auto max-w-5xl overflow-hidden rounded-lg bg-cream shadow-lg">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-body/10 bg-cream/95 px-5 py-4 backdrop-blur-md md:px-8">
          <div className="flex items-center gap-4">
            <div className="hidden w-28 shrink-0 sm:block">
              <CaseStudyLogo study={study} />
            </div>
            <div>
            <p className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-coral">
              {study.category === "strategy" ? "Campaign" : "Content"} · {study.client}
            </p>
            <h2 id="case-study-title" className="mt-1 font-serif text-2xl font-bold text-body md:text-3xl">
              {study.title}
            </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-body/15 font-sans text-xl text-body transition-colors hover:border-coral hover:text-coral"
            aria-label="Close case study"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-8 md:px-8">
          <div className="mx-auto max-w-3xl">
            <div className="mb-7 sm:hidden">
              <CaseStudyLogo study={study} />
            </div>
            <p className="font-sans text-lg leading-relaxed text-body/70">
              {study.summary}
            </p>

            {study.highlights && study.highlights.length > 0 && (
              <div className="mt-8">
                <h3 className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-coral">
                  Highlights
                </h3>
                <ul className="mt-3 space-y-2">
                  {study.highlights.map((item) => (
                    <li key={item} className="flex gap-3 font-sans text-sm leading-relaxed text-body/65">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-coral" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {study.role && study.role.length > 0 && (
              <div className="mt-8">
                <h3 className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-coral">
                  Niamh's role
                </h3>
                <ul className="mt-3 space-y-2">
                  {study.role.map((item) => (
                    <li key={item} className="flex gap-3 font-sans text-sm leading-relaxed text-body/65">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-coral" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {study.testimonial && (
              <blockquote className="mt-8 rounded-lg border-l-2 border-coral bg-coral/[0.04] px-5 py-4">
                <p className="font-sans text-sm italic leading-relaxed text-body/70">
                  &ldquo;{study.testimonial.quote}&rdquo;
                </p>
                <footer className="mt-3 font-sans text-xs font-medium text-coral">
                  {study.testimonial.author}
                </footer>
              </blockquote>
            )}

            <div className="mt-8 rounded-lg border border-coral/20 bg-off-white px-5 py-6 text-body">
              <h3 className="font-serif text-2xl font-semibold leading-tight">
                Need support like this?
              </h3>
              <p className="mt-3 font-sans text-sm leading-relaxed text-body/65">
                Share what you are working on and Niamh can help shape the next
                step.
              </p>
              <Link
                to="/contact"
                onClick={onClose}
                className="mt-5 inline-flex rounded-full bg-coral px-5 py-2.5 font-sans text-xs font-semibold uppercase tracking-wider text-off-white transition hover:bg-coral-700"
              >
                Book a chat
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
