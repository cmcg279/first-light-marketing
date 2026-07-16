import { Link } from "react-router-dom";
import { HeroSection } from "../components/HeroSection";
import { FunnelStage } from "../components/FunnelStage";
import { APPROACH } from "../content/approach";

export default function Approach() {
  return (
    <>
      <HeroSection heading="How I work" subheading={APPROACH.framing} sunburst />

      <section className="mx-auto max-w-2xl px-6 py-24">
        {APPROACH.stages.map((s, i) => (
          <FunnelStage key={s.title} stage={i + 1} title={s.title} subtitle={s.subtitle} description={s.description} last={i === APPROACH.stages.length - 1} />
        ))}

        <div className="mt-12 rounded-2xl border border-body/10 bg-white/40 p-8 text-center">
          <p className="font-serif text-xl leading-relaxed text-body/80">{APPROACH.closing}</p>
        </div>
      </section>

      <section className="bg-coral px-6 py-20 text-center">
        <h2 className="font-serif text-3xl font-bold text-off-white md:text-4xl">Ready to find your first light?</h2>
        <p className="mx-auto mt-4 max-w-lg font-sans text-lg text-off-white/80">Every successful marketing journey begins with a clear direction. Let's find yours.</p>
        <Link to="/contact" className="mt-8 inline-block rounded-full border-2 border-off-white px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-off-white transition-all hover:bg-off-white hover:text-coral">Let's talk</Link>
      </section>
    </>
  );
}
