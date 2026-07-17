import { Link } from "react-router-dom";
import { LeadFormCard } from "../components/LeadFormCard";

const CLIENT_LOGOS = [
  { src: "logos/clients/kukoon.png", alt: "Kukoon" },
  { src: "logos/clients/nearby.png", alt: "Nearby" },
  { src: "logos/clients/forest-feast.png", alt: "Forest Feast" },
  { src: "logos/clients/sw-wholesale.png", alt: "S&W Wholesale" },
  { src: "logos/clients/belfast-zoo.png", alt: "Belfast Zoo" },
  { src: "logos/clients/cancer-council-nsw.png", alt: "Cancer Council NSW" },
];

export default function Home() {
  return (
    <>
      {/* ── 1. Hero band — coral background, centered logo lockup ── */}
      <section className="bg-coral py-4 md:py-5 text-center">
        <div className="mx-auto max-w-md px-6">
          <img
            src="logos/1-cropped.png"
            alt="First Light Marketing"
            className="mx-auto h-auto w-full max-w-[280px]"
          />
        </div>
      </section>

      {/* ── 2. Intro section — cream background, two-column ── */}
      <section className="bg-cream">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-12 md:grid-cols-2 md:py-16">
          {/* Left: headline + CTA */}
          <div>
            <h2 className="font-serif text-3xl font-bold leading-tight text-body md:text-4xl lg:text-5xl">
              Bringing clarity to your marketing.
            </h2>
            <a
              href="#contact"
              className="mt-8 inline-block rounded-full bg-coral px-8 py-3.5 font-sans text-sm font-semibold uppercase tracking-wider text-off-white transition-all hover:bg-coral-700 hover:shadow-lg"
            >
              See how I can help
            </a>
          </div>

          {/* Right: image of Niamh */}
          <div className="flex justify-center">
            <img
              src="images/niamh.png"
              alt="Niamh Donnelly"
              className="shadow-lg w-full max-w-sm object-cover aspect-[3/4]"
            />
          </div>
        </div>

        {/* ── 3. Capability strip — thin text bar ── */}
        <div className="border-t border-body/10">
          <div className="flex items-center justify-center gap-4 py-7">
            <span className="hidden h-px w-12 bg-coral/30 sm:block" />
            <p className="text-center font-sans text-xs font-semibold uppercase tracking-[0.25em] text-coral/80">
              Strategy &bull; Content &bull; Campaigns &bull; Marketing Support
            </p>
            <span className="hidden h-px w-12 bg-coral/30 sm:block" />
          </div>
        </div>
      </section>

      {/* ── 4. The meaning ── */}
      <section className="bg-cream pt-16 pb-8">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <p className="font-serif text-2xl leading-relaxed text-body md:text-3xl">
            &ldquo;First light is the moment the first rays of sunlight appear on the
            horizon, signalling the start of a new day. It&rsquo;s a time of clarity,
            fresh perspective and new possibilities.&rdquo;
          </p>
        </div>
      </section>

      {/* ── 5. About + brands — Slide 1 copy with client logos ── */}
      <section className="bg-cream">
        <div className="mx-auto max-w-3xl px-6 pt-8 pb-20 text-center">
          <p className="font-sans text-lg leading-relaxed text-body/70 md:text-xl">
            That&rsquo;s the approach I bring to every business I work with. Whether
            you&rsquo;re starting from scratch, refreshing your brand or ready to grow,
            every successful marketing journey begins with a clear direction.
          </p>
          <p className="mt-6 font-sans text-lg leading-relaxed text-body/70 md:text-xl">
            My role is to help uncover opportunities, build meaningful strategies and
            create marketing that moves your business forward.
          </p>
          <p className="mt-6 font-sans text-lg leading-relaxed text-body/70 md:text-xl">
            Backed by a degree in Communications, Advertising &amp; Marketing and a
            decade of experience, I have got to work with some pretty cool brands:
          </p>

          {/* Client logo grid */}
          <div className="mt-10 flex flex-nowrap items-center justify-between gap-4">
            {CLIENT_LOGOS.map((c) => (
              <img
                key={c.alt}
                src={c.src}
                alt={c.alt}
                className="h-8 w-auto max-w-[14%] object-contain opacity-50 grayscale transition-all hover:opacity-80 hover:grayscale-0 sm:h-10"
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── See the work ── */}
      <div className="bg-cream pb-24 text-center">
        <Link
          to="/work"
          className="inline-block rounded-full border-2 border-body px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-body transition-all hover:bg-body hover:text-cream"
        >
          See the full case studies
        </Link>
      </div>

      {/* ── Contact form ── */}
      <section id="contact" className="bg-coral px-6 py-20 scroll-mt-20">
        <div className="mx-auto max-w-lg text-center">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-off-white/60">
            Get in touch
          </p>
          <h2 className="mt-2 font-serif text-3xl font-bold text-off-white md:text-4xl">
            I&rsquo;m ready when you are
          </h2>
          <p className="mx-auto mt-4 max-w-md font-sans text-lg text-off-white/80">
            Every project starts with a conversation, no pressure, no
            obligation.
          </p>
        </div>
        <div className="mx-auto mt-10">
          <LeadFormCard />
        </div>
      </section>
    </>
  );
}
