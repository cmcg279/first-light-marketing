import { Link } from "react-router-dom";
import { HeroSection } from "../components/HeroSection";
import { ServiceCard } from "../components/ServiceCard";
import { SERVICES } from "../content/services";

export default function Services() {
  return (
    <>
      <HeroSection
        heading="How we can work together"
        subheading="Whether you need ongoing support or a one-off campaign, there's a way to work together that fits."
        sunburst
      />

      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((s, i) => (
            <ServiceCard
              key={s.title}
              title={s.title}
              description={s.description}
              index={i + 1}
            />
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-body/10 bg-white/40 p-8 text-center">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.15em] text-coral">
            Tailored to you
          </p>
          <p className="mt-2 font-serif text-xl text-body">
            Bespoke packages available based on your goals and budget.
          </p>
        </div>
      </section>

      <section className="bg-coral px-6 py-20 text-center">
        <h2 className="font-serif text-3xl font-bold text-off-white md:text-4xl">
          Ready to get started?
        </h2>
        <p className="mx-auto mt-4 max-w-lg font-sans text-lg text-off-white/80">
          Let&rsquo;s chat about what you need. Every project starts with a
          conversation, no pressure, no obligation.
        </p>
        <Link
          to="/contact"
          className="mt-8 inline-block rounded-full border-2 border-off-white px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-off-white transition-all hover:bg-off-white hover:text-coral"
        >
          Get in touch
        </Link>
      </section>
    </>
  );
}
