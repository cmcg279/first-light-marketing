import { useEffect, useState } from "react";
import { HeroSection } from "../components/HeroSection";
import { Seo } from "../components/Seo";
import { TrustedBy } from "../components/TrustedBy";
import { ABOUT } from "../content/about";
import { getPublicContent } from "../lib/adminApi";
import type { ManagedAboutContent } from "../types/admin";

const DEFAULT_ABOUT_CONTENT: ManagedAboutContent = {
  heroHeading: "Why First Light?",
  heroSubheading: "Clarity. Fresh perspective. New possibilities.",
  sectionHeading: "A strategic partner for your business",
  paragraphs: [...ABOUT.paragraphs],
  educationLabel: "Education",
  educationText: "Degree in Communications, Advertising & Marketing",
  experienceLabel: "Experience",
  experienceText: "A decade of marketing experience",
};

export default function About() {
  const [pageContent, setPageContent] = useState(DEFAULT_ABOUT_CONTENT);

  useEffect(() => {
    let cancelled = false;
    getPublicContent()
      .then((content) => {
        if (!cancelled) {
          setPageContent({
            ...DEFAULT_ABOUT_CONTENT,
            ...content.about,
            paragraphs: content.about?.paragraphs?.length ? content.about.paragraphs : DEFAULT_ABOUT_CONTENT.paragraphs,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setPageContent(DEFAULT_ABOUT_CONTENT);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Seo
        title="About"
        description={pageContent.heroSubheading}
        path="/about"
      />
      <HeroSection heading={pageContent.heroHeading} subheading={pageContent.heroSubheading} sunburst />

      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid gap-16 md:grid-cols-2 md:gap-12">
          <div>
            <h2 className="font-serif text-2xl font-bold text-body md:text-3xl">{pageContent.sectionHeading}</h2>
            <div className="mt-6 space-y-4">
              {pageContent.paragraphs.map((p, i) => (
                <p key={i} className="font-sans text-base leading-relaxed text-body/70">{p}</p>
              ))}
            </div>
          </div>
          <div className="space-y-8">
            <div>
              <p className="font-sans text-xs font-semibold uppercase tracking-[0.15em] text-coral">{pageContent.educationLabel}</p>
              <p className="mt-1 font-serif text-xl text-body">{pageContent.educationText}</p>
            </div>
            <div>
              <p className="font-sans text-xs font-semibold uppercase tracking-[0.15em] text-coral">{pageContent.experienceLabel}</p>
              <p className="mt-1 font-serif text-xl text-body">{pageContent.experienceText}</p>
            </div>
          </div>
        </div>
      </section>

      <TrustedBy brands={ABOUT.trustedBy} />
    </>
  );
}
