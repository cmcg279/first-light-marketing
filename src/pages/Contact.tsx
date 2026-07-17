import { HeroSection } from "../components/HeroSection";
import { LeadForm } from "../components/LeadForm";
import { CONTACT } from "../content/site";

export default function Contact() {
  return (
    <>
      <HeroSection heading="Let's talk" subheading="I'm ready when you are. Every project starts with a conversation, no pressure, no obligation." sunburst />

      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="mx-auto grid max-w-3xl gap-12 md:grid-cols-5">
          <div className="md:col-span-3">
            <LeadForm />
          </div>

          <div className="md:col-span-2">
            <div className="rounded-2xl border border-body/10 bg-white/40 p-8">
              <h3 className="font-serif text-xl font-semibold text-body">Prefer to email directly?</h3>
              <p className="mt-3 font-sans text-sm leading-relaxed text-body/60">You can reach me anytime. I aim to respond within 24 hours.</p>
              <a href={`mailto:${CONTACT.email}`} className="mt-5 inline-block font-sans text-base font-medium text-coral underline underline-offset-2 hover:text-coral-700 transition-colors">{CONTACT.email}</a>

              <hr className="my-6 border-body/10" />

              <h3 className="font-serif text-xl font-semibold text-body">Follow along</h3>
              <p className="mt-3 font-sans text-sm leading-relaxed text-body/60">Check out my TikTok for local content, behind-the-scenes, and a taste of what I do.</p>
              <a href={CONTACT.tiktok.url} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-full border border-body/15 px-4 py-2 font-sans text-sm font-medium text-body transition-colors hover:border-coral hover:text-coral">{CONTACT.tiktok.handle}</a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
