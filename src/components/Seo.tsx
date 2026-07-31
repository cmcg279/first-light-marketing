import { Helmet } from "react-helmet-async";

const SITE_NAME = "First Light Marketing";
const SITE_URL = "https://firstlightmarketing.co.uk";
const DEFAULT_DESCRIPTION =
  "Marketing support, strategy, content creation and campaign delivery for small businesses and growing brands.";
const DEFAULT_IMAGE = `${SITE_URL}/logos/1-cropped.png`;

export function Seo({
  title,
  description = DEFAULT_DESCRIPTION,
  image = DEFAULT_IMAGE,
  path = "/",
  type = "website",
  noindex = false,
}: {
  title: string;
  description?: string;
  image?: string;
  path?: string;
  type?: "website" | "article";
  noindex?: boolean;
}) {
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  const canonicalUrl = `${SITE_URL}${path}`;
  const imageUrl = image.startsWith("http") ? image : `${SITE_URL}${image.startsWith("/") ? image : `/${image}`}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      {noindex && <meta name="robots" content="noindex,nofollow" />}
      <link rel="canonical" href={canonicalUrl} />

      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={imageUrl} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />
    </Helmet>
  );
}
