import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPublicContent } from "../lib/adminApi";
import type { ManagedSiteContent } from "../types/admin";

export function ManagedAnnouncement() {
  const [content, setContent] = useState<ManagedSiteContent | null>(null);

  useEffect(() => {
    let cancelled = false;

    getPublicContent()
      .then((nextContent) => {
        if (!cancelled) setContent(nextContent);
      })
      .catch(() => {
        if (!cancelled) setContent(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const announcement = content?.announcement;

  if (!announcement?.enabled) return null;

  const button = announcement.buttonHref.startsWith("/") ? (
    <Link
      to={announcement.buttonHref}
      className="inline-flex rounded-full bg-coral px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-off-white transition hover:bg-coral-700"
    >
      {announcement.buttonLabel}
    </Link>
  ) : (
    <a
      href={announcement.buttonHref}
      className="inline-flex rounded-full bg-coral px-6 py-3 font-sans text-sm font-semibold uppercase tracking-wider text-off-white transition hover:bg-coral-700"
    >
      {announcement.buttonLabel}
    </a>
  );

  return (
    <section className="bg-cream px-6 py-12 text-body">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="max-w-3xl">
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.22em] text-coral">
            {announcement.eyebrow}
          </p>
          <h2 className="mt-3 font-serif text-2xl font-bold leading-tight md:text-3xl">
            {announcement.title}
          </h2>
          <p className="mt-4 font-sans text-base leading-relaxed text-body/70">
            {announcement.body}
          </p>
        </div>
        <div className="shrink-0">{button}</div>
      </div>
    </section>
  );
}
