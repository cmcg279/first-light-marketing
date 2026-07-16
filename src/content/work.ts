export interface CaseStudy {
  slug: string;
  client: string;
  title: string;
  category: "strategy" | "content";
  summary: string;
  image?: string;
  role?: string[];
  results?: { label: string; value: string }[];
  testimonial?: { quote: string; author: string };
  metrics?: { label: string; value: string }[];
}

export const CASE_STUDIES: CaseStudy[] = [
  {
    slug: "kukoon-black-friday-2025",
    client: "Kukoon",
    title: "Black Friday Campaign 2025",
    category: "strategy",
    summary:
      "Coordinated a large-scale, multi-channel Black Friday campaign — the biggest day in e-commerce. Full ownership from strategy through to analysis.",
    role: [
      "Strategy & creative ideas",
      "Social media, emails, paid ads, influencers, in-store print",
      "Full campaign ownership from start to finish",
      "Briefing videographers & campaign analysis",
      "And jumping out of a plane! (Skydive Ireland stunt)",
    ],
    results: [
      { label: "5-day revenue", value: "£1.8M" },
      { label: "Year-on-year", value: "+289%" },
      { label: "Website visitors", value: "461.9K" },
    ],
    image: "images/work/kukoon-black-friday.jpg",
  },
  {
    slug: "kukoon-influencer-drive",
    client: "Kukoon",
    title: "6-Month Influencer Drive",
    category: "strategy",
    summary:
      "Introduced a structured influencer framework. Made collaborations consistent, efficient, and commercially focused — halving some initial fees through negotiation.",
    role: ["Strategy", "Influencer research & outreach", "Price negotiation", "Analysis"],
    results: [
      { label: "Total revenue", value: "£911K" },
      { label: "ROAS", value: "4.31× (target 3×)" },
      { label: "Creators", value: "22 incl. Terrie McEvoy, Rachel Gorry, Binky Felstead" },
    ],
    metrics: [
      { label: "Avg order value", value: "£172" },
      { label: "Avg CPM", value: "£9.64" },
      { label: "Avg CPC", value: "£0.89" },
      { label: "Click-through rate", value: "2.51%" },
    ],
  },
  {
    slug: "kukoon-product-launch",
    client: "Kukoon",
    title: "Product Launches & Always-On",
    category: "strategy",
    summary:
      "Built launch strategies including Kukoon × Caoimhe — one of the biggest launches in company history. Coordinated photoshoot, content, email, paid ads, and PR.",
    role: ["Launch strategy", "Photoshoot & content planning", "Email & paid ads", "PR"],
    results: [
      { label: "First 3 months", value: "£109K revenue" },
      { label: "First year", value: "£888K revenue" },
      { label: "Efficiency", value: "All from one content shoot" },
    ],
    image: "images/work/kukoon-caoimhe.jpg",
  },
  {
    slug: "kukoon-peter-irvine",
    client: "Kukoon",
    title: "Peter Irvine Launch Event",
    category: "strategy",
    summary:
      "Planned and delivered an exclusive in-store launch event — influencer outreach, event styling, branded materials, and on-the-day management.",
    testimonial: {
      quote:
        "Well done tonight on a wonderful event, well attended and very well executed 👏 Special shoutout to Niamh D for pulling it all together!",
      author: "Kukoon team",
    },
    image: "images/work/kukoon-peter-irvine.jpg",
  },
  {
    slug: "tranquility-head-spa",
    client: "Tranquility Head Spa Dungannon",
    title: "Launch Content — Japanese Head Spa",
    category: "content",
    summary:
      "Short-form promotional videos for a new Japanese Head Spa launch — 90K views, fully booked for over a month within days.",
    results: [
      { label: "Views", value: "~90K" },
      { label: "Impact", value: "Fully booked 1+ month" },
    ],
  },
  {
    slug: "naturopathic-way",
    client: "The Naturopathic Way",
    title: "Wellness Event Content",
    category: "content",
    summary:
      "On-site social content capture — photos and video so the client could stay present with her guests instead of managing content herself.",
    testimonial: {
      quote:
        "Thanks so much Niamh, the content was great and it was so so nice not having to worry about lifting my phone all day trying to remember about content.",
      author: "Shaundelle, The Naturopathic Way",
    },
  },
  {
    slug: "tiktok-content",
    client: "NI Hospitality",
    title: "TikTok Content Creation",
    category: "content",
    summary:
      "Built a TikTok platform (@niamh.donnellyx) creating engaging content around local cafés, restaurants, and experiences — consistently reaching thousands.",
    metrics: [
      { label: "The Coffee Cart, Portadown", value: "45K plays · 1,177 likes · 633 shares" },
      { label: "Ceili, Carlingford", value: "35K plays · 1,564 likes · 754 shares" },
      { label: "Feast, Rostrevor", value: "33K plays · 849 likes · 95 shares" },
      { label: "Primrose Cafe, Portadown", value: "35K plays · 798 likes · 629 shares" },
    ],
  },
  {
    slug: "ugc-brands",
    client: "30+ Online Brands",
    title: "UGC for Online Brands",
    category: "content",
    summary:
      "Partnered with 30+ brands to create authentic UGC — product demos, testimonials, unboxings, and lifestyle content across skincare, travel, software, and experiences.",
    results: [
      {
        label: "Notable brands",
        value:
          "111SKIN, Roamless, World of Books, Sculpted by Aimee, Saily, Travelzoo, and 12+ more",
      },
    ],
  },
];
