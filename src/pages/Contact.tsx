import { useEffect, useState } from "react";
import { LeadFormCard } from "../components/LeadFormCard";
import { Seo } from "../components/Seo";
import { CONTACT } from "../content/site";
import { getPublicContent } from "../lib/adminApi";
import type { ManagedContactContent } from "../types/admin";

const DEFAULT_CONTACT_CONTENT: ManagedContactContent = {
  eyebrow: "Contact",
  heading: "Let’s talk about your marketing.",
  body: "Tell Niamh what you need help with and she’ll come back with the best next step. No pressure, no obligation.",
  formEyebrow: "Start here",
  formHeading: "Tell me what you need help with.",
  emailTitle: "Prefer to email directly?",
  emailDescription: "Send a note any time. Niamh aims to respond within 24 hours.",
  tiktokTitle: "See what she creates",
  tiktokDescription: "Local content, behind-the-scenes clips and a feel for her style.",
};

const CONTACT_POINTS = [
  {
    label: "Email",
    title: "Prefer to email directly?",
    description: "Send a note any time. Niamh aims to respond within 24 hours.",
    href: `mailto:${CONTACT.email}`,
    value: CONTACT.email,
    external: false,
  },
  {
    label: "TikTok",
    title: "See what she creates",
    description: "Local content, behind-the-scenes clips and a feel for her style.",
    href: CONTACT.tiktok.url,
    value: CONTACT.tiktok.handle,
    external: true,
  },
] as const;

export default function Contact() {
  const [pageContent, setPageContent] = useState(DEFAULT_CONTACT_CONTENT);

  useEffect(() => {
    let cancelled = false;
    getPublicContent()
      .then((content) => {
        if (!cancelled) setPageContent({ ...DEFAULT_CONTACT_CONTENT, ...content.contact });
      })
      .catch(() => {
        if (!cancelled) setPageContent(DEFAULT_CONTACT_CONTENT);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const contactPoints = CONTACT_POINTS.map((point) => {
    if (point.label === "Email") {
      return { ...point, title: pageContent.emailTitle, description: pageContent.emailDescription };
    }

    return { ...point, title: pageContent.tiktokTitle, description: pageContent.tiktokDescription };
  });

  return (
    <>
      <Seo
        title="Contact"
        description={pageContent.body}
        path="/contact"
      />
      <section className="mx-auto max-w-6xl px-6 py-14 md:py-20">
      <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
        <header className="lg:col-start-1 lg:row-start-1">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-coral">
            {pageContent.eyebrow}
          </p>
          <h1 className="mt-3 font-serif text-4xl font-bold leading-tight text-body md:text-5xl">
            {pageContent.heading}
          </h1>
          <p className="mt-5 max-w-xl font-sans text-base leading-relaxed text-body/65 md:text-lg">
            {pageContent.body}
          </p>
        </header>

        <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <div className="mx-auto mb-5 max-w-md">
            <p className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-coral">
              {pageContent.formEyebrow}
            </p>
            <h2 className="mt-2 font-serif text-2xl font-semibold text-body">
              {pageContent.formHeading}
            </h2>
          </div>
          <LeadFormCard />
        </div>

        <div className="grid gap-3 lg:col-start-1 lg:row-start-2">
          {contactPoints.map((point) => (
            <a
              key={point.label}
              href={point.href}
              target={point.external ? "_blank" : undefined}
              rel={point.external ? "noopener noreferrer" : undefined}
              className="group rounded-lg border border-body/10 bg-white/55 p-5 transition-all hover:-translate-y-0.5 hover:border-coral/35 hover:shadow-md"
            >
              <p className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-coral">
                {point.label}
              </p>
              <h2 className="mt-2 font-serif text-xl font-semibold text-body">
                {point.title}
              </h2>
              <p className="mt-2 font-sans text-sm leading-relaxed text-body/60">
                {point.description}
              </p>
              <p className="mt-4 break-words font-sans text-sm font-semibold text-body transition-colors group-hover:text-coral">
                {point.value}
              </p>
            </a>
          ))}
        </div>
      </div>
      </section>
    </>
  );
}
