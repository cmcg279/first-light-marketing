import { Link } from "react-router-dom";
import { SELECTED_RESULTS } from "../content/results";

export function SelectedResults() {
  return (
    <section className="bg-body px-6 py-20 text-cream">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-end">
          <div>
            <p className="font-sans text-xs font-semibold uppercase tracking-[0.22em] text-coral">
              Selected results
            </p>
            <h2 className="mt-3 max-w-xl font-serif text-3xl font-bold leading-tight md:text-4xl">
              Campaign, content and launch work with numbers behind it.
            </h2>
            <p className="mt-5 max-w-xl font-sans text-lg leading-relaxed text-cream/65">
              A snapshot of recent outcomes across ecommerce campaigns,
              influencer strategy, launch content and short-form video.
            </p>
            <Link
              to="/work"
              className="mt-8 inline-flex rounded-full border border-cream/25 px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-cream transition-all hover:border-coral hover:bg-coral"
            >
              Explore the work
            </Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {SELECTED_RESULTS.map((result) => (
              <Link
                key={`${result.value}-${result.label}`}
                to="/work"
                className="group rounded-lg border border-cream/10 bg-cream/[0.06] p-5 transition-all hover:-translate-y-1 hover:border-coral/60 hover:bg-cream/[0.09]"
              >
                <p className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-cream/45">
                  {result.source}
                </p>
                <p className="mt-4 font-serif text-4xl font-bold text-coral">
                  {result.value}
                </p>
                <p className="mt-3 font-sans text-sm font-semibold uppercase tracking-[0.16em] text-cream">
                  {result.label}
                </p>
                <p className="mt-3 font-sans text-sm leading-relaxed text-cream/55 transition-colors group-hover:text-cream/75">
                  {result.context}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
