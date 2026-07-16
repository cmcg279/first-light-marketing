export function TrustedBy({ brands }: { brands: readonly string[] }) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-12">
      <p className="mb-8 text-center font-sans text-xs font-semibold uppercase tracking-[0.2em] text-body/50">
        Brands I've worked with
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
        {brands.map((b) => (
          <div key={b} className="flex items-center justify-center">
            {/* TODO: swap in <img src={`/logos/${b.toLowerCase().replace(/\s+/g, '-')}.png`} alt={b} className="h-10 w-auto opacity-50 grayscale hover:opacity-80 hover:grayscale-0 transition-all" /> */}
            <span className="font-serif text-lg font-semibold text-body/50 italic transition-colors hover:text-body/70">{b}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
