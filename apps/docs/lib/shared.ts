// What the site needs to know about where it lives

export const app_name = "r3f-afterburner";

export const tagline =
  "Raymarched jet and rocket plumes for React Three Fiber, in TSL for WebGPU.";

// What search engines and link previews show
export const description =
  "Realistic jet engine afterburner and rocket exhaust plumes for three.js and React Three Fiber: raymarched in TSL for WebGPU, with shock diamonds, heat haze and one instanced draw.";

// The base path, for URLs Next does not prefix itself (plain <a>, fetch)
export const base_path = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Where the site is served, for absolute URLs: the sitemap, link previews
export const site_url = `${process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://romainlg29.github.io"}${base_path}`;

export const repository =
  process.env.NEXT_PUBLIC_REPOSITORY_URL ??
  "https://github.com/Romainlg29/afterburner";

/**
 * Where a page's markdown is served, for the copy and open buttons.
 * @param page The page's slugs
 * @returns The route's segments, and its URL
 */
export const page_markdown = (page: { slugs: string[] }) => {
  const segments = [...page.slugs, "content.md"];

  // Fetched by hand, so it needs the base path
  return {
    segments,
    url: `${base_path}/llms.mdx/docs/${segments.join("/")}`,
  };
};
