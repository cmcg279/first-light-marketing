import type { ServiceOffering } from "../content/services";

export function ServiceCard({
  service,
  index,
}: {
  service: ServiceOffering;
  index: number;
}) {
  return (
    <article className="group flex h-full flex-col rounded-lg border border-body/10 bg-white/55 p-6 transition-all hover:-translate-y-1 hover:border-coral/35 hover:shadow-lg md:p-7">
      <div className="flex items-start justify-between gap-4">
        <span className="font-serif text-5xl font-bold leading-none text-coral/15 transition-colors group-hover:text-coral/25">
          {String(index).padStart(2, "0")}
        </span>
        <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-coral/50" />
      </div>

      <h3 className="mt-5 font-serif text-2xl font-semibold leading-tight text-body">
        {service.title}
      </h3>
      <p className="mt-2 font-sans text-sm font-semibold uppercase tracking-[0.16em] text-coral">
        {service.strapline}
      </p>

      <p className="mt-5 font-sans text-sm leading-relaxed text-body/65">
        {service.description[0]}
      </p>

      {service.description.length > 1 && (
        <details className="mt-4 group/details">
          <summary className="cursor-pointer list-none font-sans text-xs font-semibold uppercase tracking-[0.16em] text-coral transition-colors hover:text-coral-700">
            More detail
          </summary>
          <div className="mt-3 space-y-3">
            {service.description.slice(1).map((paragraph) => (
              <p key={paragraph} className="font-sans text-sm leading-relaxed text-body/65">
                {paragraph}
              </p>
            ))}
          </div>
        </details>
      )}

      {(service.perfectFor || service.includes) && (
        <div className="mt-5 grid gap-4 border-t border-body/10 pt-5">
          {service.perfectFor && (
            <ServiceList label="Perfect for" items={service.perfectFor} />
          )}
          {service.includes && (
            <ServiceList label="Includes" items={service.includes} />
          )}
        </div>
      )}
    </article>
  );
}

function ServiceList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <p className="font-sans text-xs font-semibold uppercase tracking-[0.18em] text-body/45">
        {label}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {items.map((item) => (
          <span
            key={item}
            className="rounded-full bg-coral/[0.08] px-2.5 py-1 font-sans text-[11px] font-medium leading-snug text-body/65"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
