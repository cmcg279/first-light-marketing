import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { HeroSection } from "../components/HeroSection";
import { CaseStudyCard } from "../components/CaseStudyCard";
import { Seo } from "../components/Seo";
import { CASE_STUDIES } from "../content/work";
import { getPublicContent } from "../lib/adminApi";
import type { ManagedWorkContent } from "../types/admin";

const DEFAULT_WORK_CONTENT: ManagedWorkContent = {
  heroHeading: "Turning First Light into lasting results",
  heroSubheading: "Every campaign begins with a clear strategy. Explore a selection of the campaigns, launches and marketing projects that have shaped my experience and delivered measurable results.",
  introEyebrow: "Work",
  introBody:
    "Every campaign begins with a clear strategy. Explore a selection of the campaigns, launches and marketing projects that have shaped my experience and delivered measurable results.",
  ctaHeading: "Want marketing support with a clearer plan behind it?",
  ctaButtonLabel: "Start a project",
};

export default function Work() {
  const [pageContent, setPageContent] = useState(DEFAULT_WORK_CONTENT);

  useEffect(() => {
    let cancelled = false;
    getPublicContent()
      .then((content) => {
        if (!cancelled) {
          setPageContent({
            ...DEFAULT_WORK_CONTENT,
            ...content.work,
            heroHeading: DEFAULT_WORK_CONTENT.heroHeading,
            heroSubheading: DEFAULT_WORK_CONTENT.heroSubheading,
            introBody: DEFAULT_WORK_CONTENT.introBody,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setPageContent(DEFAULT_WORK_CONTENT);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Seo
        title="Marketing work and case studies"
        description={pageContent.heroSubheading}
        path="/work"
      />
      <HeroSection
        heading={pageContent.heroHeading}
        subheading={pageContent.heroSubheading}
        coral
      />

      <section className="mx-auto max-w-6xl px-6 py-16 md:py-20">
        <div className="border-b border-body/15">
          {CASE_STUDIES.map((study) => (
            <CaseStudyCard
              key={study.slug}
              study={study}
            />
          ))}
        </div>
      </section>

      <section className="bg-coral px-6 py-20 text-center">
        <h2 className="font-serif text-3xl font-bold text-off-white md:text-4xl">{pageContent.ctaHeading}</h2>
        <Link to="/contact" className="mt-8 inline-block rounded-full border-2 border-off-white px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-off-white transition-all hover:bg-off-white hover:text-coral">{pageContent.ctaButtonLabel}</Link>
      </section>
    </>
  );
}
