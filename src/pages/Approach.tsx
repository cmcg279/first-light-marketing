import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HeroSection } from "../components/HeroSection";
import { FunnelStage } from "../components/FunnelStage";
import { Seo } from "../components/Seo";
import { APPROACH } from "../content/approach";
import { getPublicContent } from "../lib/adminApi";
import type { ManagedApproachContent } from "../types/admin";

const DEFAULT_APPROACH_CONTENT: ManagedApproachContent = {
  heroHeading: "How I work",
  heroSubheading: APPROACH.framing,
  closing: APPROACH.closing,
  ctaHeading: "Ready to find your first light?",
  ctaBody: "Every successful marketing journey begins with a clear direction. Let's find yours.",
  ctaButtonLabel: "Let's talk",
};

export default function Approach() {
  const [pageContent, setPageContent] = useState(DEFAULT_APPROACH_CONTENT);

  useEffect(() => {
    let cancelled = false;
    getPublicContent()
      .then((content) => {
        if (!cancelled) setPageContent({ ...DEFAULT_APPROACH_CONTENT, ...content.approach });
      })
      .catch(() => {
        if (!cancelled) setPageContent(DEFAULT_APPROACH_CONTENT);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Seo
        title="Marketing approach"
        description={pageContent.heroSubheading}
        path="/approach"
      />
      <HeroSection heading={pageContent.heroHeading} subheading={pageContent.heroSubheading} sunburst />

      <section className="mx-auto max-w-2xl px-6 py-24">
        {APPROACH.stages.map((s, i) => (
          <FunnelStage key={s.title} stage={i + 1} title={s.title} subtitle={s.subtitle} description={s.description} last={i === APPROACH.stages.length - 1} />
        ))}

        <div className="mt-12 rounded-2xl border border-body/10 bg-white/40 p-8 text-center">
          <p className="font-serif text-xl leading-relaxed text-body/80">{pageContent.closing}</p>
        </div>
      </section>

      <section className="bg-coral px-6 py-20 text-center">
        <h2 className="font-serif text-3xl font-bold text-off-white md:text-4xl">{pageContent.ctaHeading}</h2>
        <p className="mx-auto mt-4 max-w-lg font-sans text-lg text-off-white/80">{pageContent.ctaBody}</p>
        <Link to="/contact" className="mt-8 inline-block rounded-full border-2 border-off-white px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-off-white transition-all hover:bg-off-white hover:text-coral">{pageContent.ctaButtonLabel}</Link>
      </section>
    </>
  );
}
