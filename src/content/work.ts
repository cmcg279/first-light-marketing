export interface CaseStudy {
  slug: string;
  client: string;
  title: string;
  category: "strategy" | "content";
  summary: string;
  logo?: string;
  logoLabel?: string;
  logos?: { src: string; alt: string }[];
  highlights?: string[];
  logoContain?: boolean;
  image?: string;
  imageFit?: "cover" | "contain";
  images?: { src: string; alt: string }[];
  role?: string[];
  results?: { label: string; value: string }[];
  testimonial?: { quote: string; author: string };
  metrics?: { label: string; value: string }[];
}

export const CASE_STUDIES: CaseStudy[] = [
  {
    slug: "kukoon",
    client: "Kukoon",
    title: "Kukoon",
    category: "strategy",
    summary: "A fast-growing DTC homeware brand.",
    logo: "logos/work/kukoon-square.png",
    highlights: [
      "Led the 2025 Black Friday campaign, generating **£1.8 million in revenue (+289% year-on-year)**.",
      "Project managed major product launches, including **Kukoon x Caoimhe, Kukoon x Peter Irvine and the Washable Textures collection**.",
      "Managed paid influencer campaigns with **22 creators**, delivering a **4.31x return on ad spend**.",
      "Planned and delivered the Kukoon x Peter Irvine launch event.",
      "Previously led the brand's social media growth, growing Instagram from **11,000 to 80,000 followers** and launching TikTok to **20,000 followers organically**.",
    ],
    role: [
      "Campaign strategy",
      "Product launch management",
      "Influencer marketing",
      "Event planning",
      "Social media growth",
    ],
  },
  {
    slug: "nearby",
    client: "Nearby",
    title: "Nearby",
    category: "strategy",
    summary: "Digital marketing for Northern Ireland's leading convenience retail group.",
    logo: "logos/work/nearby-square.png",
    highlights: [
      "Developed and delivered the brand's digital marketing strategy.",
      "Launched the first gifted and paid influencer programme to increase local brand awareness.",
      "Managed Meta advertising campaigns across **100+ store locations** using geo-targeted campaigns.",
      "Produced email marketing and local content designed to increase store visits and customer engagement.",
    ],
    role: [
      "Digital strategy",
      "Influencer programme development",
      "Geo-targeted Meta advertising",
      "Email marketing",
      "Local content",
    ],
  },
  {
    slug: "cancer-council-nsw",
    client: "Cancer Council NSW",
    title: "Cancer Council NSW",
    category: "strategy",
    summary: "One of Australia's largest not-for-profit organisations.",
    logo: "logos/work/cancer-council-nsw.png",
    logoContain: true,
    highlights: [
      "Supported the delivery of **multi-million dollar fundraising campaigns**, including Relay For Life, Australia's Biggest Morning Tea and Cancer Research Giving Day.",
      "Managed email marketing, supporter journeys and campaign communications.",
      "Helped improve the supporter experience through data-led marketing and CRM activity.",
    ],
    role: [
      "Fundraising campaign support",
      "Email marketing",
      "Supporter journeys",
      "CRM activity",
      "Campaign communications",
    ],
  },
  {
    slug: "tiktok-content",
    client: "@niamh.donnellyx",
    title: "TikTok Content Creation (@niamh.donnellyx)",
    category: "content",
    summary: "Building an engaged audience through organic content.",
    logo: "logos/social/tiktok.png",
    highlights: [
      "Grew a local lifestyle TikTok account to **3,500+ followers** through organic content alone. **124k likes, 13.8k shares**",
      "Created content reaching **3million+ people**, with consistent engagement across lifestyle, travel and local discovery content. Most videos reach **10-50k people**.",
      "Collaborated with local businesses to increase brand awareness through authentic, community-focused content.",
      "Built an engaged audience by creating content designed to entertain, inform and inspire action.",
    ],
    role: [
      "Organic content creation",
      "Short-form video",
      "Local discovery",
      "Community-led storytelling",
    ],
  },
  {
    slug: "ugc-brands",
    client: "30+ online brands",
    title: "User-Generated Content (UGC)",
    category: "content",
    summary: "Helping brands tell better stories through creator-led content.",
    logos: [
      { src: "logos/clients/saily.png", alt: "Saily" },
      { src: "logos/clients/by-babes.png", alt: "ByBabes" },
      { src: "logos/clients/nibbed.png", alt: "Nibbed" },
      { src: "logos/clients/pharma-plus.png", alt: "Pharma Plus" },
    ],
    highlights: [
      "Partnered with **30+ brands** to create scroll-stopping UGC for paid advertising, social media and website listings. Some brands include **Saily, Cornish Seaweed Bath Company, By Babes, Peak Tax, Nibbed, Pharma Plus**.",
      "Developed concepts, scripts and video content designed to increase engagement and conversions.",
      "Produced content across multiple industries including beauty, travel, fashion, home and wellness.",
      "Experienced creating content that balances authentic storytelling with commercial performance.",
    ],
    role: [
      "UGC strategy",
      "Concept development",
      "Script writing",
      "Product demos",
      "Lifestyle content",
    ],
  },
];
