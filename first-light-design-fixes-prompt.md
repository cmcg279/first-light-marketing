# Addendum Prompt: Design Polish Pass

Paste this to the coding agent working on the First Light Marketing repo. These are targeted design fixes from a design review of the current build — not a rewrite, just cleanup. Keep the header/nav logo treatment exactly as-is (icon-only `6-cropped.png`, no wordmark) — that one's confirmed, don't touch it.

## 1. Remove the duplicate logo section on the homepage

In `src/pages/Home.tsx`, there's a section commented `{/* ── Logo 2 lockup ── */}` that renders `/logos/2-cropped.png` full-size, sitting between the "About + brands" section and the "See the work" CTA. The full "First Light Marketing" wordmark already appears in the nav and as the entire coral hero band above — this third repeat adds nothing and breaks up the page's flow. Delete this section entirely. Let the "About + brands" section flow directly into the "See the work" CTA.

## 2. Reconsider where the headline sits relative to the hero

Right now the page opens with a coral band containing *only* the logo lockup (`1-cropped.png`), and the actual value-proposition headline ("Bringing clarity to your marketing.") doesn't appear until the section after it. That means the entire first fold on most screens is pure branding with no message. Two options, your call on which reads better once built:
- **Option A:** Move the "Bringing clarity to your marketing." headline (and its CTA button) into the coral hero band itself, alongside or below the logo, so the value prop is visible without scrolling.
- **Option B:** Keep the logo-only coral band short (reduce its vertical padding from `py-8 md:py-10` if needed so it reads as a brand strip, not a full hero), so the headline section effectively becomes the real hero and appears sooner on screen.

Don't remove the logo band entirely — just make sure a visitor sees the actual message before they have to scroll past a branding-only section.

## 3. Unify the cream color value across the site and the logo assets

`tailwind.config.ts` currently defines:
- `cream.DEFAULT: "#FFF4EE"`
- `off-white: "#FFF8EE"`

But the actual cream used inside the logo files (and the transparent-background PNGs already cropped into `public/logos/`) is `#FFE9DD`. This mismatch is subtle but real: the cropped/transparent logo PNGs (`2-transparent.png`, the client logos in `public/logos/clients/`) were anti-aliased against `#FFE9DD`, so their edges will show a faint mismatched halo when placed on the site's current `#FFF4EE`/`#FFF8EE` backgrounds.

Fix: standardize the site's cream background value to `#FFE9DD` (update `tailwind.config.ts`), and decide whether `off-white` (used for text-on-coral) needs to remain a separate, slightly lighter shade for contrast reasons — if so keep it distinct from the background cream, but don't let it drift close enough to cause confusion. Re-check every section using `bg-cream` after the change.

## 4. Add real imagery to the Work/case-study page

`src/pages/Work.tsx` and `CaseStudyCard.tsx` currently render every case study as text + stat cards only — no photography, despite the source material (`assets/proposal/`) containing real campaign imagery: the Kukoon × Peter Irvine launch event (cupcakes/signage, event crowd, goodie bags), Kukoon × Caoimhe product shots, the Black Friday campaign creative, and TikTok video thumbnails for the local-content case study.

Extend the `CaseStudy` type in `src/content/work.ts` with an optional `image` field, and add at least one representative image per case study where source material exists (crop/export usable stills from the relevant `assets/proposal/*.png` slides, or use placeholder treatment for studies without a clean source image). Update `CaseStudyCard.tsx` to render the image above or beside the text content. This is the single biggest thing missing from the portfolio page — right now it's all claims and no visual proof, for a business whose actual output is visual content.

## 5. Run an accessibility contrast pass on low-opacity text

The codebase leans heavily on opacity-based secondary text color (`text-body/40`, `/50`, `/60`, `/70`, `text-cream/40`, `text-off-white/60`, `/80`) across nearly every component. Some combinations are likely below WCAG AA (4.5:1 for normal text, 3:1 for large text), especially:
- `text-body/40` — the "Brands I've worked with" uppercase label in `TrustedBy.tsx` (small text, low contrast is riskiest here)
- `text-cream/40` — the footer copyright line in `Footer.tsx`, sitting on a dark `bg-body` background

Audit every low-opacity text usage against its actual background color (not just against white), and bump opacity or pick a solid color where a computed contrast check fails. Don't just eyeball it — calculate actual contrast ratios (e.g. with a script or browser devtools) for each background/text combination in use.

## What NOT to change here

Leave the `Header.tsx` nav logo (icon-only, no wordmark) exactly as it is — that's a confirmed decision, not open for revision in this pass. Also leave the `ServiceCard` numbered treatment, `FunnelStage` vertical timeline, pill-button styling, and the grayscale→color hover treatment on client logos untouched — those are working well and aren't part of this fix list.
