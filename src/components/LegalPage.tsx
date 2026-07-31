import type { ReactNode } from "react";

export function LegalPage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <>
      <section className="bg-coral px-6 py-16 text-center text-off-white md:py-20">
        <p className="font-sans text-xs font-semibold uppercase tracking-[0.2em] text-off-white/70">
          {eyebrow}
        </p>
        <h1 className="mx-auto mt-3 max-w-3xl font-serif text-4xl font-bold leading-tight md:text-5xl">
          {title}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl font-sans text-base leading-relaxed text-off-white/80 md:text-lg">
          {description}
        </p>
      </section>

      <section className="bg-cream px-6 py-16 md:py-20">
        <div className="legal-content mx-auto max-w-3xl rounded-lg bg-off-white px-6 py-8 shadow-sm md:px-10 md:py-12">
          {children}
        </div>
      </section>
    </>
  );
}
