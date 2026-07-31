export const BRAND = {
  name: "First Light Marketing",
  tagline: "Bringing clarity to your marketing.",
} as const;

export const CONTACT = {
  email: "niamh@firstlightmarketing.co.uk",
  tiktok: { handle: "@niamh.donnellyx", url: "https://www.tiktok.com/@niamh.donnellyx" },
} as const;

export const NAV = [
  { label: "About", href: "/about" },
  { label: "Services", href: "/services" },
  { label: "Work", href: "/work" },
  { label: "Contact", href: "/contact" },
] as const;
