export function FunnelStage({
  stage,
  title,
  subtitle,
  description,
  last = false,
}: {
  stage: number;
  title: string;
  subtitle: string;
  description: string;
  last?: boolean;
}) {
  return (
    <div className="flex gap-6 md:gap-8">
      <div className="flex flex-col items-center">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-coral text-lg font-bold text-off-white shadow-md">
          {stage}
        </div>
        {!last && <div className="mt-2 w-0.5 flex-1 bg-coral/20" style={{ minHeight: "3rem" }} />}
      </div>
      <div className={last ? "" : "pb-12"}>
        <span className="font-sans text-xs font-semibold uppercase tracking-[0.15em] text-coral">{title}</span>
        <h3 className="mt-1 font-serif text-xl font-semibold text-body md:text-2xl">{subtitle}</h3>
        <p className="mt-3 max-w-prose font-sans text-base leading-relaxed text-body/60">{description}</p>
      </div>
    </div>
  );
}
