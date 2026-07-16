# Project Brief: First Light Marketing — Website Build

Paste this whole document to your coding agent (e.g. Claude Code) as the starting prompt.

## 1. Project summary

Build a marketing website for **First Light Marketing**, a freelance marketing consultancy run by **Niamh Donnelly**. Niamh offers marketing support, monthly retainers, content creation/shoots, campaign delivery, and marketing strategy/consultancy to small-to-mid-size brands.

This is v1 of a longer-lived product. v1 is a public marketing site (no login). A later phase will add an authenticated **client management dashboard** (CRM-style: clients, proposals, projects, invoices). Architect and provision the whole stack now — data layer, auth, API — even though only the public site ships in v1. Do not build something that requires a rewrite to add the dashboard later.

I'm a software engineer and will be pairing with you on this, so favor idiomatic, well-documented infrastructure-as-code over anything GUI-click-driven or vendor-locked (no Squarespace/Wix/WordPress equivalents).

## 2. Architecture requirements

- **Hosting:** AWS, with a custom domain (domain TBD — placeholder it via Route 53 + ACM certificate, wire up DNS instructions).
- **Approach:** Full-stack from day one:
  - **Frontend:** Next.js (App Router, TypeScript). Marketing pages can be statically generated/ISR; leave room for authenticated app routes later.
  - **Backend/API:** API routes or a separate Lambda-backed API (API Gateway + Lambda) — pick whichever keeps the Next.js app and future CRM API cleanly separated. Use TypeScript throughout.
  - **Database:** DynamoDB (or RDS/Postgres if you think relational fits the future CRM data model better — clients, proposals, projects, invoices are naturally relational, so justify your choice).
  - **Auth:** Provision Amazon Cognito (or similar) now, even if v1 has no login screens, so the dashboard phase just adds UI + routes, not new infra.
  - **Static assets/images:** S3 + CloudFront.
  - **IaC:** AWS CDK (TypeScript) or Terraform — your call, but everything must be defined as code and reproducible, not clicked together in the console.
  - **CI/CD:** GitHub Actions (or similar) for build/deploy on push to main, with a staging/preview option if reasonably easy to add.
- **Extensibility:** Structure the repo so a future `/dashboard` (or subdomain) section can be added without touching the public marketing pages — clear separation of public site, shared UI/design system, and app/dashboard code.
- Keep v1 infrastructure cost-conscious (this is a solo freelancer's brochure site) — don't over-provision compute; serverless/pay-per-use where possible.

## 3. Brand assets

All assets are in the project's `assets/` folder:
- `assets/logos/` — logo variants (1–6), including a coral-on-cream and cream-on-coral lockup, both with and without the "MARKETING" subline.
- `assets/proposal/` — a client proposal deck (PNGs) containing Niamh's bio, brand story, service list, case studies, and testimonials. Use this as the primary source of website copy (see Section 5).

**Brand palette** (sampled from the logo files):
- Coral / brand primary: `#FF5757`
- Cream / warm background: `#FFE9DD`
- Off-white text-on-coral: `#FFF8EE`
- Use a near-black or dark navy for body copy on light backgrounds (pick something that passes WCAG AA against `#FFE9DD`, e.g. `#1A1A1A`).

**Typography feel:** headlines use a classic serif (the logo wordmark and proposal headings are serif — something like Playfair Display, Lora, or similar works well), body/UI text uses a clean geometric sans-serif (the "MARKETING" subline and proposal body copy are sans-serif — something like Inter or Work Sans).

**Visual motif:** a sunburst/sunrise graphic (radiating lines) appears above the wordmark — this "first light" sunrise motif can recur subtly in the site (e.g., as a section divider, hero background element, or hover accent). Keep it minimal, not literal/cheesy.

## 4. Design reference

I like the visual direction of **taylormarketingni.com** most — use it as the primary style reference (clean, confident, modern freelance-marketer feel). Also look at these for secondary inspiration/contrast:
- thegreenroomcreative.com
- staysocialco.com
- ivyhilldigital.com

Don't clone any of them — use them to calibrate layout conventions (hero structure, services grid, case-study/portfolio cards, contact CTA) for a solo marketing consultant's site, then apply First Light's own coral/cream palette and serif branding.

## 5. Content (pull from `assets/proposal/`)

A full text transcription of the proposal deck is in **`first-light-proposal-transcript.md`** (same folder) — use it directly as source copy instead of re-reading the images. It also surfaces two service/proof tracks not summarized below: a **TikTok local-content** track (organic short-form content for NI hospitality venues like The Coffee Cart, Ceili, Feast, Primrose Cafe, and Tranquility Head Spa Dungannon — handle **@niamh.donnellyx**) and a **UGC content creation** track (30+ brand partners incl. 111SKIN, Roamless, World of Books, Sculpted by Aimee, Saily, Travelzoo). Consider whether either warrants its own case-study card or service line.

Use the proposal images as source material for real copy, not placeholder lorem ipsum:

- **Brand story / About:** "First light is the moment the first rays of sunlight appear on the horizon, signalling the start of a new day. It's a time of clarity, fresh perspective and new possibilities." Niamh positions herself as a strategic partner who helps businesses find clear direction — whether starting from scratch, refreshing a brand, or scaling up. She holds a degree in Communications, Advertising & Marketing and has ~a decade of experience.
- **Notable brands worked with:** Kukoon, Nearby, Forest Feast, S&W Wholesale, Belfast Zoo, Cancer Council NSW — display as a logo strip or "trusted by" section.
- **Services offered** ("How we can work together"):
  1. Marketing Support
  2. Monthly Marketing Retainers
  3. Content Creation & Shoots
  4. Campaign & Project Delivery
  5. Marketing Strategy & Consultancy
  - Note: "Bespoke packages available based on your goals and budget."
- **Methodology / Marketing Funnel section** — a 5-stage funnel that could become an illustrated section on the site:
  1. **Attract** — Helping people discover your business (visibility, right audience).
  2. **Engage** — Building trust and creating connection (valuable, consistent marketing).
  3. **Convert** — Turning interest into action (purchase, booking, enquiry).
  4. **Retain** — Keeping customers engaged (loyalty, repeat business).
  5. **Advocate** — Turning customers into brand ambassadors (reviews, referrals).
  - Framing line: "Like the first light of a new day, every customer journey begins with discovery. Strategic marketing nurtures that journey into trust, action and lasting loyalty."
- **Case studies / portfolio** (use as featured work items, each with a headline stat):
  - **Kukoon × Caoimhe product launch:** launch strategy across photoshoot, content shoot, email, paid ads, PR. £109k revenue in first 3 months; £888k in year one from the same content shoot.
  - **Kukoon 6-month influencer drive:** built a structured creator framework (strategy, research, outreach, negotiation, analysis). Worked with 22 creators (incl. Terrie McEvoy, Rachel Gorry, Binky Felstead, Clodagh McKenna, Caoimhe McGinley); £911k revenue generated, 4.31x ROAS (target was 3x).
  - **Kukoon Black Friday 2025 campaign:** full-funnel campaign ownership (social, email, paid ads, influencers, in-store print, video). £1.8M revenue over 5 days, +289% YoY; 461.9k website visitors.
  - **Kukoon × Peter Irvine launch event:** planned/delivered an in-store launch event (influencer outreach, styling, branded materials).
  - **The Naturopathic Way — wellness event content:** on-site content capture (social content, BTS photo/video) so the client could stay present with guests instead of managing content herself. Include the testimonial: *"Thanks so much Niamh, the content was great and it was so so nice not having to worry about lifting my phone all day trying to remember about content."*
- **CTA / closing section:** "Your next chapter starts here… With fresh thinking. Clear direction. Marketing that moves your business forward." "I'm ready when you are" — contact: **niamh@firstlightmarketing.co.uk**.

Extract exact figures/quotes directly from the proposal images rather than paraphrasing loosely, since these are real client results and should stay accurate.

## 6. Site structure (v1)

Propose a sitemap and get my sign-off before building, but as a starting point:
- **Home** — hero (name/tagline + sunburst motif), brief intro, services overview, "trusted by" logo strip, 1–2 featured case-study stats, CTA to contact.
- **About** — Niamh's story, the "First Light" meaning, background/experience.
- **Services** — the 5 offerings, with the "bespoke packages" note.
- **Approach/Method** — the Attract → Engage → Convert → Retain → Advocate funnel, illustrated.
- **Work/Case Studies** — the Kukoon and Naturopathic Way stories with results and testimonials.
- **Contact** — contact form (name/email/message → sends to niamh@firstlightmarketing.co.uk, or store as a lead if you're already building the data layer) + direct email link.

Keep copy tight and confident — this mirrors an agency-quality freelance site, not a hobby page.

## 7. What I want from you first

Before writing code:
1. Confirm/propose the exact AWS architecture (services, IaC tool, repo layout) based on Section 2.
2. Propose a sitemap/page list based on Section 6.
3. Confirm typography choices (specific font names) and how the sunburst motif will be used.

Then scaffold the repo, get the marketing site content in, and set up the AWS deploy pipeline end-to-end (including custom domain wiring instructions, since I'll supply the actual domain).
