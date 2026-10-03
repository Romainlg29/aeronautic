import type { MetadataRoute } from "next";
import { site_url } from "@/lib/shared";
import { source } from "@/lib/source";

export const dynamic = "force-static";

/**
 * Every page, for search engines.
 * @returns The sitemap
 */
const sitemap = (): MetadataRoute.Sitemap => [
  { url: `${site_url}/` },
  ...source.getPages().map((page) => ({ url: `${site_url}${page.url}/` })),
];

export default sitemap;
