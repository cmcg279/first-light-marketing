import { useEffect, useState } from "react";
import { LeadFormCard } from "../components/LeadFormCard";
import { ManagedAnnouncement } from "../components/ManagedAnnouncement";
import { Seo } from "../components/Seo";
import { getPublicContent } from "../lib/adminApi";
import type { ManagedHomeContent } from "../types/admin";

const CLIENT_LOGOS = [
  { src: "logos/clients/kukoon.png", alt: "Kukoon" },
  { src: "logos/clients/nearby.png", alt: "Nearby" },
  { src: "logos/clients/forest-feast.png", alt: "Forest Feast" },
  { src: "logos/clients/sw-wholesale.png", alt: "S&W Wholesale" },
  { src: "logos/clients/belfast-zoo.png", alt: "Belfast Zoo" },
  { src: "logos/clients/cancer-council-nsw.png", alt: "Cancer Council NSW" },
  { src: "logos/clients/111skin.png", alt: "111SKIN", large: true },
  { src: "logos/clients/roamless.png", alt: "Roamless", large: true },
  { src: "logos/clients/by-babes.png", alt: "ByBabes", large: true },
  { src: "logos/clients/world-of-books.png", alt: "World of Books", large: true },
  { src: "logos/clients/saily.png", alt: "Saily", large: true },
  { src: "logos/clients/nibbed.png", alt: "Nibbed", large: true },
  { src: "logos/clients/whatnot.png", alt: "Whatnot", large: true },
  { src: "logos/clients/seacra.png", alt: "Seacra", large: true },
  { src: "logos/clients/travelzoo.png", alt: "Travelzoo", large: true },
  { src: "logos/clients/pharma-plus.png", alt: "Pharma Plus", large: true },
];

const DEFAULT_HOME_CONTENT: ManagedHomeContent = {
  heroHeading: "Bringing clarity to your marketing.",
  heroButtonLabel: "See how I can help",
  capabilityStrip: "Strategy • Content • Campaigns • Marketing Support",
  firstLightQuote:
    "First light is the moment the first rays of sunlight appear on the horizon, signalling the start of a new day. It’s a time of clarity, fresh perspective and new possibilities.",
  introParagraphs: [
    "That’s the approach I bring to every business I work with. Whether you’re starting from scratch, refreshing your brand or ready to grow, every successful marketing journey begins with a clear direction.",
  ],
  contactEyebrow: "Get in touch",
  contactTitle: "I’m ready when you are",
  contactBody: "Every project starts with a conversation, no pressure, no obligation.",
};

const WORK_TOGETHER = [
  "Marketing Support",
  "Monthly Marketing Retainers",
  "Content Creation & Shoots",
  "Campaign & Project Delivery",
  "Marketing Strategy & Consultancy",
];

const HIDDEN_INTRO_PARAGRAPHS = new Set([
  "My role is to help uncover opportunities, build meaningful strategies and create Bringing clarity to your marketing.",
  "Backed by a degree in Communications, Advertising & Marketing and a decade of experience, I have got to work with some pretty cool brands:",
]);

export default function Home() {
  const [homeContent, setHomeContent] = useState<ManagedHomeContent>(DEFAULT_HOME_CONTENT);

  useEffect(() => {
    let cancelled = false;

    getPublicContent()
      .then((content) => {
        if (!cancelled) {
          setHomeContent({
            ...DEFAULT_HOME_CONTENT,
            ...content.home,
            introParagraphs: content.home?.introParagraphs?.length
              ? content.home.introParagraphs
              : DEFAULT_HOME_CONTENT.introParagraphs,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setHomeContent(DEFAULT_HOME_CONTENT);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <Seo
        title="Marketing support, strategy and content"
        description="First Light Marketing brings clarity to your marketing through strategy, content creation, campaigns and flexible marketing support."
        path="/"
      />
      {/* ── 1. Hero band — coral background, centered logo lockup ── */}
      <section className="bg-coral px-6 py-14 text-center md:py-20">
        <div className="mx-auto max-w-md">
          <img
            src="logos/2-transparent.png"
            alt="First Light Marketing"
            className="mx-auto h-auto w-full max-w-[300px] brightness-0 invert"
          />
        </div>
      </section>

      {/* ── 2. Intro section — cream background, split feature ── */}
      <section className="bg-cream">
        <div className="mx-auto grid max-w-6xl items-stretch md:grid-cols-[0.9fr_1.1fr]">
          <div className="relative z-10 flex flex-col justify-center px-6 py-10 md:px-10 lg:px-12">
            <div className="rounded-r-[3rem] bg-off-white px-6 py-7 shadow-sm md:-mr-20 md:px-10">
              <h1 className="font-serif text-2xl font-bold leading-tight text-coral sm:text-3xl md:text-4xl">
                {homeContent.heroHeading}
              </h1>
            </div>
            <ul className="mt-7 max-w-md list-disc space-y-2 pl-5 font-sans text-sm leading-relaxed text-body md:text-base">
              <li>
                First class honours degree in Communication, Advertising and Marketing
              </li>
                <li>A decade of experience</li>
            </ul>
            <button
              onClick={() => document.getElementById("contact")?.scrollIntoView({ behavior: "smooth" })}
              className="mt-8 self-start rounded-full bg-coral px-8 py-3.5 font-sans text-sm font-semibold uppercase tracking-wider text-off-white transition-all hover:bg-coral-700 hover:shadow-lg"
            >
              {homeContent.heroButtonLabel}
            </button>
          </div>

          <div className="min-h-[360px] md:min-h-[520px]">
            <img
              src="images/niamh-banner.jpg"
              alt="Niamh Donnelly"
              className="h-full w-full object-cover object-center"
            />
          </div>
        </div>

        {/* ── 3. Capability strip — thin text bar ── */}
        <div className="bg-coral/65 px-6 py-3">
          <div className="mx-auto max-w-6xl">
            <p className="text-center font-sans text-sm font-bold text-off-white sm:text-base md:text-lg">
              {homeContent.capabilityStrip.replace(/•/g, " - ")}
            </p>
          </div>
        </div>
      </section>

      <ManagedAnnouncement />

      {/* ── 4. The meaning ── */}
      <section className="bg-coral px-6 py-10 text-center md:py-14">
        <div className="mx-auto max-w-4xl">
          <p className="font-serif text-xl leading-relaxed text-off-white sm:text-2xl md:text-3xl">
            {homeContent.firstLightQuote}
          </p>
        </div>
      </section>

      {/* ── 5. About + brands — Slide 1 copy with client logos ── */}
      <section className="bg-cream">
        <div className="mx-auto max-w-4xl px-6 pt-8 pb-8 text-center">
          <div className="mx-auto max-w-3xl rounded-t-[3rem] rounded-r-[3rem] bg-off-white px-7 py-7 shadow-sm md:px-12 md:py-9">
            {homeContent.introParagraphs
              .filter((paragraph) => !HIDDEN_INTRO_PARAGRAPHS.has(paragraph))
              .map((paragraph) => (
                <p
                  key={paragraph}
                  className="font-sans text-base leading-relaxed text-body md:text-lg"
                >
                  {paragraph}
                </p>
              ))}
          </div>
        </div>

        <div className="overflow-hidden bg-off-white py-7 [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
          <div className="brand-marquee flex w-max items-center gap-12 px-6">
            {[0, 1].map((group) => (
              <div
                key={group}
                className="flex h-16 shrink-0 items-center justify-center gap-11"
                aria-hidden={group === 1}
              >
                <span className="whitespace-nowrap font-sans text-sm font-semibold uppercase tracking-[0.2em] text-coral">
                  Trusted by
                </span>
                {CLIENT_LOGOS.map((client) => (
                  <img
                    key={`${group}-${client.alt}`}
                    src={client.src}
                    alt={group === 0 ? client.alt : ""}
                    className={`w-auto object-contain opacity-65 grayscale transition-all hover:opacity-90 hover:grayscale-0 ${
                      client.large ? "max-h-12 max-w-[165px]" : "max-h-10 max-w-[140px]"
                    }`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-coral/55">
        <img
          src="images/home-sunrise-beach.jpg"
          alt="Sunrise over the sea"
          className="h-[260px] w-full object-cover md:h-[420px]"
        />
      </section>

      <section className="bg-coral px-6 py-16 text-off-white md:py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="font-serif text-3xl font-bold leading-tight md:text-4xl">
            How we can work together:
          </h2>
          <ul className="mt-7 list-disc space-y-2 pl-6 font-sans text-lg leading-relaxed md:text-xl">
            {WORK_TOGETHER.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mt-8 max-w-2xl font-sans text-lg italic leading-relaxed text-off-white/90 md:text-xl">
            Bespoke packages available based on your goals and budget.
          </p>
        </div>
      </section>

      {/* ── Contact form ── */}
      <section id="contact" className="bg-cream px-6 py-16 scroll-mt-20 md:py-20">
        <div className="mx-auto max-w-lg text-center">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-coral">
            {homeContent.contactEyebrow}
          </p>
          <h2 className="mt-2 font-serif text-3xl font-bold text-body md:text-4xl">
            {homeContent.contactTitle}
          </h2>
          <p className="mx-auto mt-4 max-w-md font-sans text-base leading-relaxed text-body/65 md:text-lg">
            {homeContent.contactBody}
          </p>
        </div>
        <div className="mx-auto mt-10">
          <LeadFormCard />
        </div>
      </section>
    </>
  );
}
