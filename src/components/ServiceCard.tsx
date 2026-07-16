export function ServiceCard({ title, description, index }: { title: string; description: string; index: number }) {
  return (
    <div className="group rounded-2xl border border-body/10 bg-white/50 p-8 transition-all hover:border-coral/30 hover:shadow-lg">
      <span className="inline-block font-serif text-5xl font-bold text-coral/15 group-hover:text-coral/25 transition-colors">
        {String(index).padStart(2, "0")}
      </span>
      <h3 className="mt-4 font-serif text-xl font-semibold text-body">{title}</h3>
      <p className="mt-3 font-sans text-base leading-relaxed text-body/60">{description}</p>
    </div>
  );
}
