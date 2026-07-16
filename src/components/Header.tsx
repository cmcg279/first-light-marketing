import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BRAND, NAV } from "../content/site";

export function Header() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-50 border-b border-body/10 bg-cream/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="group" onClick={() => setOpen(false)}>
          <img
            src="/logos/6-cropped.png"
            alt="First Light Marketing"
            className="h-8 w-auto"
          />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {NAV.map((l) => (
            <Link
              key={l.href}
              to={l.href}
              className={`font-sans text-sm font-medium transition-colors ${
                pathname === l.href ? "text-coral" : "text-body/70 hover:text-coral"
              }`}
            >
              {l.label}
            </Link>
          ))}
          <Link to="/contact" className="rounded-full bg-coral px-6 py-3 font-sans text-xs font-semibold uppercase tracking-wider text-off-white transition-all hover:bg-coral-700 hover:shadow-lg">
            Get in touch
          </Link>
        </nav>

        <button className="flex flex-col gap-1 md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
          <span className={`block h-0.5 w-6 bg-body transition-transform ${open ? "translate-y-1.5 rotate-45" : ""}`} />
          <span className={`block h-0.5 w-6 bg-body transition-opacity ${open ? "opacity-0" : ""}`} />
          <span className={`block h-0.5 w-6 bg-body transition-transform ${open ? "-translate-y-1.5 -rotate-45" : ""}`} />
        </button>
      </div>

      {open && (
        <nav className="border-t border-body/10 bg-cream px-6 pb-6 pt-4 md:hidden flex flex-col gap-4">
          {NAV.map((l) => (
            <Link
              key={l.href}
              to={l.href}
              className="font-sans text-base font-medium text-body/70 hover:text-coral"
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
          <Link to="/contact" className="self-start rounded-full bg-coral px-6 py-3 font-sans text-xs font-semibold uppercase tracking-wider text-off-white" onClick={() => setOpen(false)}>
            Get in touch
          </Link>
        </nav>
      )}
    </header>
  );
}

export function SunburstGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <circle cx="8" cy="16" r="4" fill="currentColor" />
      {[0, 30, 60, 90, 120, 150].map((angle, i) => (
        <line
          key={i}
          x1="8" y1="16"
          x2={8 + 20 * Math.cos((angle * Math.PI) / 180)}
          y2={16 + -20 * Math.sin((angle * Math.PI) / 180)}
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
          opacity={0.6 + i * 0.06}
        />
      ))}
    </svg>
  );
}
