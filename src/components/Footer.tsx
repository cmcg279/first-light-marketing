import { Link } from "react-router-dom";
import { BRAND, CONTACT, NAV } from "../content/site";

export function Footer() {
  return (
    <footer className="border-t border-body/10 bg-body text-cream">
      <div className="mx-auto max-w-6xl px-6 py-12 grid gap-12 md:grid-cols-3">
        <div className="flex flex-col gap-4">
          <Link to="/" className="flex items-center">
            <img
              src="logos/2-transparent.png"
              alt="First Light Marketing"
              className="h-10 w-auto"
            />
          </Link>
          <p className="max-w-xs font-sans text-sm text-cream/60">{BRAND.tagline}</p>
        </div>

        <div>
          <h4 className="mb-3 font-sans text-xs font-semibold uppercase tracking-widest text-coral">Pages</h4>
          <nav className="flex flex-col gap-2">
            {NAV.map((l) => (
              <Link key={l.href} to={l.href} className="font-sans text-sm text-cream/60 hover:text-cream transition-colors">
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <div>
          <h4 className="mb-3 font-sans text-xs font-semibold uppercase tracking-widest text-coral">Get in touch</h4>
          <div className="flex flex-col gap-2">
            <a href={`mailto:${CONTACT.email}`} className="font-sans text-sm text-cream/60 hover:text-cream transition-colors">
              {CONTACT.email}
            </a>
            <a href={CONTACT.tiktok.url} target="_blank" rel="noopener noreferrer" className="font-sans text-sm text-cream/60 hover:text-cream transition-colors">
              TikTok {CONTACT.tiktok.handle}
            </a>
          </div>
        </div>
      </div>
      <div className="border-t border-cream/10 px-6 py-4">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-center md:flex-row md:text-left">
          <p className="font-sans text-xs text-cream/60">&copy; {new Date().getFullYear()} {BRAND.name}. All rights reserved.</p>
          <nav className="flex flex-wrap justify-center gap-x-4 gap-y-2">
            <Link to="/privacy" className="font-sans text-xs text-cream/60 transition-colors hover:text-cream">Privacy Policy</Link>
            <Link to="/cookies" className="font-sans text-xs text-cream/60 transition-colors hover:text-cream">Cookie Policy</Link>
            <Link to="/terms" className="font-sans text-xs text-cream/60 transition-colors hover:text-cream">Terms</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
