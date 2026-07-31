import { Link } from "react-router-dom";

export function SelectedResults() {
  return (
    <section className="bg-body px-6 py-20 text-cream">
      <div className="mx-auto max-w-3xl text-center">
        <p className="font-sans text-xs font-semibold uppercase tracking-[0.22em] text-coral">
          Selected work
        </p>
        <h2 className="mt-3 font-serif text-3xl font-bold leading-tight md:text-4xl">
          Campaign, content and launch work built with clear commercial intent.
        </h2>
        <p className="mx-auto mt-5 max-w-2xl font-sans text-lg leading-relaxed text-cream/65">
          Browse recent projects across ecommerce campaigns, influencer strategy,
          launch content and short-form video.
        </p>
        <Link
          to="/work"
          className="mt-8 inline-flex rounded-full border border-cream/25 px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-cream transition-all hover:border-coral hover:bg-coral"
        >
          See what I have done
        </Link>
      </div>
    </section>
  );
}
