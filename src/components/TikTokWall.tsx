import { useEffect } from "react";
import { CONTACT } from "../content/site";

type TikTokWindow = Window & {
  tiktokEmbed?: {
    load: () => void;
  };
};

export function TikTokWall() {
  useEffect(() => {
    const tiktokWindow = window as TikTokWindow;
    let retryTimer: number | undefined;

    const loadTikTokEmbeds = () => {
      if (typeof tiktokWindow.tiktokEmbed?.load === "function") {
        tiktokWindow.tiktokEmbed.load();
        return true;
      }

      return false;
    };

    const injectScript = () => {
      document.getElementById("tiktok-embed-script")?.remove();

      const script = document.createElement("script");
      script.id = "tiktok-embed-script";
      script.src = "https://www.tiktok.com/embed.js";
      script.async = true;
      script.onload = () => loadTikTokEmbeds();
      document.body.appendChild(script);
    };

    if (!loadTikTokEmbeds()) {
      injectScript();
    }

    retryTimer = window.setTimeout(() => {
      if (!loadTikTokEmbeds()) {
        injectScript();
      }
    }, 500);

    return () => {
      window.clearTimeout(retryTimer);
    };
  }, []);

  return (
    <section className="bg-off-white px-6 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
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
