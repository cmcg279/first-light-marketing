import { HeroSection } from "../components/HeroSection";
import { TrustedBy } from "../components/TrustedBy";
import { ABOUT } from "../content/about";

export default function About() {
  return (
    <>
      <HeroSection heading="Why First Light?" subheading="Clarity. Fresh perspective. New possibilities." sunburst />

      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="grid gap-16 md:grid-cols-2 md:gap-12">
          <div>
            <h2 className="font-serif text-2xl font-bold text-body md:text-3xl">A strategic partner for your business</h2>
            <div className="mt-6 space-y-4">
              {ABOUT.paragraphs.map((p, i) => (
                <p key={i} className="font-sans text-base leading-relaxed text-body/70">{p}</p>
              ))}
            </div>
          </div>
          <div className="space-y-8">
            <div>
              <p className="font-sans text-xs font-semibold uppercase tracking-[0.15em] text-coral">Education</p>
              <p className="mt-1 font-serif text-xl text-body">Degree in Communications, Advertising & Marketing</p>
            </div>
            <div>
              <p className="font-sans text-xs font-semibold uppercase tracking-[0.15em] text-coral">Experience</p>
              <p className="mt-1 font-serif text-xl text-body">Almost a decade in marketing</p>
            </div>
          </div>
        </div>
      </section>

      <TrustedBy brands={ABOUT.trustedBy} />
    </>
  );
}
