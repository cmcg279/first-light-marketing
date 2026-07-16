import type { CaseStudy } from "../content/work";

export function CaseStudyCard({ study }: { study: CaseStudy }) {
  return (
    <article className="group relative overflow-hidden rounded-2xl border border-body/10 bg-white/60 transition-all hover:border-coral/30 hover:shadow-lg">
      {/* Image */}
      {study.image && (
        <div className="aspect-[16/10] overflow-hidden">
          <img
            src={study.image}
            alt={study.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      )}

      {/* Hover illumination */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-coral/5 opacity-0 blur-3xl transition-opacity group-hover:opacity-100" />

      <div className="relative p-8">
        <div className="mb-1 flex items-center gap-3">
          <span className="rounded-full bg-coral/10 px-3 py-1 font-sans text-xs font-semibold uppercase tracking-wider text-coral">
            {study.category === "strategy" ? "Campaign" : "Content"}
          </span>
          <span className="font-sans text-sm font-medium text-body/50">{study.client}</span>
        </div>

        <h3 className="font-serif text-xl font-semibold text-body md:text-2xl">{study.title}</h3>
        <p className="mt-3 font-sans text-base leading-relaxed text-body/60">{study.summary}</p>

        {study.results && study.results.length > 0 && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {study.results.slice(0, 4).map((r) => (
              <div key={r.label} className="rounded-xl bg-coral/5 px-4 py-3">
                <p className="font-serif text-2xl font-bold text-coral">{r.value}</p>
                <p className="mt-1 font-sans text-xs font-medium text-body/50">{r.label}</p>
              </div>
            ))}
          </div>
        )}

        {study.metrics && study.metrics.length > 0 && (
          <div className="mt-6 overflow-hidden rounded-xl border border-body/5">
            <table className="w-full text-left">
              <tbody>
                {study.metrics.map((m, i) => (
                  <tr key={m.label} className={i % 2 === 0 ? "bg-body/[0.02]" : ""}>
                    <td className="px-4 py-2.5 font-sans text-sm text-body/60">{m.label}</td>
                    <td className="px-4 py-2.5 font-sans text-sm font-semibold text-body/80">{m.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {study.testimonial && (
          <blockquote className="mt-6 rounded-xl border-l-2 border-coral bg-coral/[0.03] px-4 py-4">
            <p className="font-sans text-sm leading-relaxed text-body/70 italic">&ldquo;{study.testimonial.quote}&rdquo;</p>
            <footer className="mt-2 font-sans text-xs font-medium text-coral">— {study.testimonial.author}</footer>
          </blockquote>
        )}
      </div>
    </article>
  );
}
