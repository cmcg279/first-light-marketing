import { Link } from "react-router-dom";
import { HeroSection } from "../components/HeroSection";
import { CaseStudyCard } from "../components/CaseStudyCard";
import { CASE_STUDIES } from "../content/work";

const strategy = CASE_STUDIES.filter((s) => s.category === "strategy");
const content = CASE_STUDIES.filter((s) => s.category === "content");

export default function Work() {
  return (
    <>
      <HeroSection heading="See for yourself" subheading="Some examples of my recent work." coral />

      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-10">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-coral">Campaigns & Strategy</p>
          <p className="mt-2 max-w-2xl font-sans text-base text-body/60">Full-funnel campaign delivery, from strategy and creative direction through to execution, analysis, and results.</p>
        </div>
        <div className="grid gap-8 lg:grid-cols-2">
          {strategy.map((s) => <CaseStudyCard key={s.slug} study={s} />)}
        </div>
      </section>

      <div className="flex items-center justify-center py-4">
        <svg width="32" height="8" viewBox="0 0 32 8" fill="none" className="text-coral/40" aria-hidden="true">
          <circle cx="16" cy="4" r="2.5" fill="currentColor" />
          {[-60, -30, 0, 30, 60, 90].map((a, i) => (
            <line key={i} x1="16" y1="4" x2={16 + 8 * Math.cos((a * Math.PI) / 180)} y2={4 + -8 * Math.sin((a * Math.PI) / 180)} stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity={0.4 + i * 0.08} />
          ))}
        </svg>
      </div>

      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-10">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-coral">Content Creation</p>
          <p className="mt-2 max-w-2xl font-sans text-base text-body/60">Short-form video, UGC, event content capture, and social content that builds awareness and drives engagement.</p>
        </div>
        <div className="grid gap-8 lg:grid-cols-2">
          {content.map((s) => <CaseStudyCard key={s.slug} study={s} />)}
        </div>
      </section>

      <section className="bg-coral px-6 py-20 text-center">
        <h2 className="font-serif text-3xl font-bold text-off-white md:text-4xl">Let's create results like these for your brand</h2>
        <Link to="/contact" className="mt-8 inline-block rounded-full border-2 border-off-white px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-off-white transition-all hover:bg-off-white hover:text-coral">Start a conversation</Link>
      </section>
    </>
  );
}
