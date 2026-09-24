import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Search result pages are endless combinations of filters: records and organisations are
// what should be indexed, and the sitemap lists them all.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/search", "/en/search"] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
