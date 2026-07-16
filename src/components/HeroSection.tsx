import { ReactNode } from "react";

export function HeroSection({
  heading,
  subheading,
  children,
  sunburst = false,
  coral = false,
}: {
  heading: string;
  subheading?: string;
  children?: ReactNode;
  sunburst?: boolean;
  coral?: boolean;
}) {
  if (coral) {
    return (
      <section className="bg-coral px-6 py-24 md:py-32 text-center">
        <div className="mx-auto max-w-3xl">
          <h1 className="font-serif text-4xl font-bold text-off-white md:text-5xl lg:text-6xl">{heading}</h1>
          {subheading && <p className="mt-6 font-sans text-lg text-off-white/80 md:text-xl">{subheading}</p>}
          {children && <div className="mt-10">{children}</div>}
        </div>
      </section>
    );
  }

  return (
    <section className={`relative overflow-hidden px-6 py-24 md:py-32 text-center ${sunburst ? "bg-sunburst" : ""}`}>
      <div className="relative mx-auto max-w-3xl">
        <h1 className="animate-fade-in font-serif text-4xl font-bold text-body md:text-5xl lg:text-6xl">{heading}</h1>
        {subheading && (
          <p className="mt-6 animate-fade-in font-sans text-lg text-body/70 md:text-xl [animation-delay:150ms]">{subheading}</p>
        )}
        {children && <div className="mt-10 animate-slide-up [animation-delay:300ms]">{children}</div>}
      </div>
    </section>
  );
}
