export interface ServiceOffering {
  title: string;
  strapline: string;
  description: string[];
  perfectFor?: string[];
  includes?: string[];
}

export interface WorkTogetherOption {
  title: string;
  description: string;
}

export const SERVICES: ServiceOffering[] = [
  {
    title: "Marketing Support",
    strapline: "Your marketing partner, without the full-time salary.",
    description: [
      "Whether you need someone to take marketing off your plate or extra support alongside your existing team, I become an extension of your business.",
      "From planning campaigns to managing day-to-day marketing, I make sure every part of your marketing is working together towards your goals.",
    ],
    perfectFor: [
      "Small businesses",
      "Growing brands",
      "Businesses without an in-house marketer",
    ],
    includes: [
      "Marketing planning",
      "Campaign management",
      "Email marketing",
      "Social media management",
      "Influencer marketing",
      "Reporting & insights",
    ],
  },
  {
    title: "Marketing Strategy",
    strapline: "Clear direction before you start.",
    description: [
      "Like the first light of a new day, every successful marketing journey begins with clarity.",
      "If you are unsure where to focus your marketing, struggling to attract the right customers or need an experienced marketer to guide your next steps, I will help you build a strategy that makes sense for your business.",
      "Together, we will uncover opportunities, identify what is holding your business back and create a practical marketing plan designed to move your business forward with confidence.",
    ],
    perfectFor: [
      "New businesses",
      "Rebrands",
      "Businesses ready to grow",
      "Teams looking for an external marketing perspective",
    ],
  },
  {
    title: "Content Creation",
    strapline: "Content that connects with your audience.",
    description: [
      "People do not buy because they have seen one advert. They buy because they have seen your business consistently showing up.",
      "I create photography and video content designed to build trust, showcase your business and give you a library of content that works across social media, your website, email marketing and advertising.",
      "Whether it is product launches, behind-the-scenes moments, customer stories or lifestyle content, everything is created with your wider marketing goals in mind.",
    ],
    includes: [
      "Social media videos",
      "Photography",
      "Product launches",
      "UGC-style content",
      "Event content",
      "Behind-the-scenes content",
    ],
  },
  {
    title: "Campaigns & Launches",
    strapline: "Bringing your biggest ideas to life.",
    description: [
      "Launching something new? Whether it is a product, service, event or seasonal campaign, I will manage every moving part to ensure your launch is organised, consistent and impactful.",
      "From planning timelines and coordinating content to briefing creatives and analysing results, I will help turn ideas into campaigns that do not just look great, they deliver results.",
    ],
    perfectFor: [
      "Product launches",
      "Seasonal campaigns",
      "Events",
      "Brand collaborations",
      "Multi-channel marketing campaigns",
    ],
  },
  {
    title: "Fractional Marketing",
    strapline: "Senior marketing expertise, when you need it.",
    description: [
      "Not every business needs a full-time Marketing Manager, but every business benefits from experienced marketing support.",
      "With almost 10 years' experience across eCommerce, retail, hospitality, wellness and non-profit organisations, I have planned and delivered marketing campaigns for brands including Kukoon, Forest Feast, S&W Wholesale, Cancer Council NSW and Belfast Zoo.",
      "Fractional marketing gives you strategic direction and hands-on support on a flexible basis, without the cost and commitment of hiring a full-time Marketing Manager.",
      "Ideal for businesses that are growing but are not quite ready for a full-time marketing hire.",
    ],
  },
];

export const WORK_TOGETHER_OPTIONS: WorkTogetherOption[] = [
  {
    title: "Monthly Marketing Retainers",
    description: "Ongoing marketing support that grows with your business.",
  },
  {
    title: "One-Off Projects",
    description: "Perfect for campaigns, launches, events or content shoots.",
  },
  {
    title: "Strategy Sessions",
    description: "A focused session to give you clarity, fresh ideas and a practical marketing plan.",
  },
  {
    title: "Bespoke Support",
    description: "Need something different? I can create a tailored package around your business and objectives.",
  },
];
