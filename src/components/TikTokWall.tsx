import { useEffect } from "react";
import { CONTACT } from "../content/site";
import { TIKTOK_CONTENT_PILLARS, TIKTOK_HIGHLIGHTS } from "../content/tiktok";

type TikTokWindow = Window & {
  tiktokEmbed?: {
    load: () => void;
  };
};

export function TikTokWall() {
  useEffect(() => {
    const existing = document.getElementById("tiktok-embed-script");
    const tiktokWindow = window as TikTokWindow;

    if (existing) {
      tiktokWindow.tiktokEmbed?.load();
      return;
    }

    const script = document.createElement("script");
    script.id = "tiktok-embed-script";
    script.src = "https://www.tiktok.com/embed.js";
    script.async = true;
    document.body.appendChild(script);
  }, []);

  return (
    <section className="bg-off-white px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
          <div>
            <p className="font-sans text-xs font-semibold uppercase tracking-[0.22em] text-coral">
              TikTok proof
            </p>
            <h2 className="mt-3 max-w-xl font-serif text-3xl font-bold leading-tight text-body md:text-4xl">
              Short-form content that turns attention into action.
            </h2>
            <p className="mt-5 max-w-2xl font-sans text-lg leading-relaxed text-body/65">
              From local recommendations to launch content, these videos show
              how strong hooks and useful storytelling can drive visits,
              bookings and brand awareness.
            </p>

            <div className="mt-7 flex flex-wrap gap-2">
              {TIKTOK_CONTENT_PILLARS.map((pillar) => (
                <span
                  key={pillar}
                  className="rounded-full border border-body/10 bg-white px-4 py-2 font-sans text-sm font-medium text-body/65"
                >
                  {pillar}
                </span>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {TIKTOK_HIGHLIGHTS.map((item) => (
              <a
                key={item.title}
                href={CONTACT.tiktok.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-lg border border-body/10 bg-cream p-5 transition-all hover:-translate-y-1 hover:border-coral/40 hover:shadow-lg"
              >
                <p className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-body/45">
                  {item.title}
                </p>
                <p className="mt-4 font-serif text-3xl font-bold text-coral">
                  {item.metric}
                </p>
                <p className="mt-2 font-sans text-sm text-body/60">{item.detail}</p>
                <p className="mt-5 font-sans text-xs font-semibold uppercase tracking-[0.18em] text-body/45 transition-colors group-hover:text-coral">
                  View on TikTok
                </p>
              </a>
            ))}
          </div>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-[minmax(0,420px)_1fr] lg:items-stretch">
          <div className="rounded-lg border border-body/10 bg-body p-6 text-off-white">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-coral font-serif text-2xl font-bold">
                N
              </div>
              <div>
                <p className="font-sans text-sm text-off-white/55">Follow along</p>
                <a
                  href={CONTACT.tiktok.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-sans text-lg font-semibold text-off-white transition-colors hover:text-coral"
                >
                  {CONTACT.tiktok.handle}
                </a>
              </div>
            </div>

            <p className="mt-6 font-sans text-base leading-relaxed text-off-white/70">
              A live channel for local recommendations, launch stories and the
              kind of short-form content brands need to show up consistently.
            </p>

            <a
              href={CONTACT.tiktok.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-flex rounded-full bg-coral px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-off-white transition-all hover:bg-coral-700"
            >
              Open TikTok
            </a>
          </div>

          <div className="min-h-[430px] overflow-hidden rounded-lg border border-body/10 bg-white">
            <blockquote
              className="tiktok-embed"
              cite={CONTACT.tiktok.url}
              data-unique-id="niamh.donnellyx"
              data-embed-type="creator"
              style={{ maxWidth: "780px", minWidth: "288px" }}
            >
              <section>
                <a
                  target="_blank"
                  rel="noopener noreferrer"
                  href={CONTACT.tiktok.url}
                >
                  {CONTACT.tiktok.handle}
                </a>
              </section>
            </blockquote>
          </div>
        </div>
      </div>
    </section>
  );
}
