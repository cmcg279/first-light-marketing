import type { CaseStudy } from "../content/work";

export function CaseStudyCard({
  study,
}: {
  study: CaseStudy;
}) {
  return (
    <article className="group grid gap-5 border-t border-body/15 py-8 transition-colors hover:border-coral md:grid-cols-[260px_1fr] md:items-center md:gap-12 md:py-12">
      <div className="flex items-center gap-4 md:block">
        <LogoBlock study={study} />
        <div className="min-w-0 md:hidden">
          <h3 className="font-serif text-2xl font-bold leading-tight text-coral">
            {study.title}
          </h3>
          <p className="mt-2 font-sans text-sm italic leading-relaxed text-body/70">
            {study.summary}
          </p>
        </div>
      </div>

      <div className="flex flex-col items-start">
        <div className="hidden md:block">
          <h3 className="font-serif text-3xl font-bold leading-tight text-coral">
            {study.title}
          </h3>
          <p className="mt-4 font-sans text-base italic leading-relaxed text-body/70">
            {study.summary}
          </p>
        </div>

        {study.highlights && study.highlights.length > 0 && (
          <ul className="space-y-2 md:mt-5">
            {study.highlights.map((highlight) => (
              <li key={highlight} className="flex gap-3 font-sans text-sm leading-relaxed text-body/65">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-coral" />
                <span>{renderEmphasis(highlight)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function LogoBlock({ study }: { study: CaseStudy }) {
  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-off-white/80 ring-1 ring-white/70 md:aspect-square md:h-auto md:w-full">
      {study.logos ? (
        <div className="grid grid-cols-2 items-center justify-items-center gap-2 p-3 md:gap-5 md:p-7">
          {study.logos.map((logo) => (
            <img
              key={logo.alt}
              src={logo.src}
              alt={logo.alt}
              className="max-h-5 w-auto max-w-8 object-contain md:max-h-9 md:max-w-[100px]"
            />
          ))}
        </div>
      ) : study.logo ? (
        <img
          src={study.logo}
          alt={study.client}
          className={`h-full w-full rounded-md object-contain mix-blend-multiply ${
            study.logoContain ? "p-3 md:p-6" : "p-2 md:p-4"
          }`}
        />
      ) : study.logoLabel ? (
        <span className="text-center font-serif text-lg font-semibold leading-tight text-coral md:text-3xl">
          {study.logoLabel}
        </span>
      ) : (
        <span className="font-serif text-base font-semibold text-coral md:text-2xl">
          First Light
        </span>
      )}
    </div>
  );
}

function renderEmphasis(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={part} className="font-semibold text-body">
          {part.slice(2, -2)}
        </strong>
      );
    }

    return part;
  });
}
