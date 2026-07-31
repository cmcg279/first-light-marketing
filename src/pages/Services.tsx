import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HeroSection } from "../components/HeroSection";
import { Seo } from "../components/Seo";
import { ServiceCard } from "../components/ServiceCard";
import { SERVICES, WORK_TOGETHER_OPTIONS } from "../content/services";
import { getPublicContent } from "../lib/adminApi";
import type { ManagedServicesContent } from "../types/admin";

const DEFAULT_SERVICES_CONTENT: ManagedServicesContent = {
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
};

export default function Services() {
  const [pageContent, setPageContent] = useState(DEFAULT_SERVICES_CONTENT);

  useEffect(() => {
    let cancelled = false;
    getPublicContent()
      .then((content) => {
        if (!cancelled) setPageContent({ ...DEFAULT_SERVICES_CONTENT, ...content.services });
      })
      .catch(() => {
        if (!cancelled) setPageContent(DEFAULT_SERVICES_CONTENT);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Seo
        title="Marketing services"
        description={pageContent.heroSubheading}
        path="/services"
      />
      <HeroSection
        heading={pageContent.heroHeading}
        subheading={pageContent.heroSubheading}
        sunburst
      />

      <section className="mx-auto max-w-6xl px-6 py-20 md:py-24">
        <div className="mb-10 max-w-3xl">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-coral">
            {pageContent.introEyebrow}
          </p>
          <h2 className="mt-3 font-serif text-3xl font-bold leading-tight text-body md:text-4xl">
            {pageContent.introHeading}
          </h2>
          <p className="mt-4 font-sans text-base leading-relaxed text-body/65 md:text-lg">
            {pageContent.introBody}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {SERVICES.map((service, index) => (
            <ServiceCard
              key={service.title}
              service={service}
              index={index + 1}
            />
          ))}
        </div>
      </section>

      <section className="border-y border-body/10 bg-white/35 px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-coral">
                {pageContent.workTogetherEyebrow}
              </p>
              <h2 className="mt-3 font-serif text-3xl font-bold leading-tight text-body md:text-4xl">
                {pageContent.workTogetherHeading}
              </h2>
              <p className="mt-4 font-sans text-base leading-relaxed text-body/65">
                {pageContent.workTogetherBody}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {WORK_TOGETHER_OPTIONS.map((option) => (
                <article
                  key={option.title}
                  className="rounded-lg border border-body/10 bg-cream/80 p-6"
                >
                  <h3 className="font-serif text-xl font-semibold text-body">
                    {option.title}
                  </h3>
                  <p className="mt-3 font-sans text-sm leading-relaxed text-body/65">
                    {option.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-coral px-6 py-20 text-center">
        <h2 className="font-serif text-3xl font-bold text-off-white md:text-4xl">
          {pageContent.ctaHeading}
        </h2>
        <p className="mx-auto mt-4 max-w-xl font-sans text-lg leading-relaxed text-off-white/80">
          {pageContent.ctaBody}
        </p>
        <Link
          to="/contact"
          className="mt-8 inline-block rounded-full border-2 border-off-white px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-off-white transition-all hover:bg-off-white hover:text-coral"
        >
          {pageContent.ctaButtonLabel}
        </Link>
      </section>
    </>
  );
}
