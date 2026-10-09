// What the site needs to know about where it lives

export const app_name = "aeronautic";

export const tagline =
  "Physically based aircraft effects for React Three Fiber, raymarched in TSL for WebGPU.";

// What search engines and link previews show
export const description =
  "Physically based aircraft effects for three.js and React Three Fiber, raymarched in TSL for WebGPU: jet afterburners and rocket plumes with shock diamonds and heat haze, wing vapor with vortex trails, shock vapor and the vapor cone, contrails that form and persist as the day says, navigation, anti-collision and landing lights to the airworthiness rules, decoy flares that burn and fall as their grain and drag say, and control surfaces, thrust vectoring and landing gear that move with one shared flight.";

// The base path, for URLs Next does not prefix itself (plain <a>, fetch)
export const base_path = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

// Where the site is served, for absolute URLs: the sitemap, link previews
export const site_url = `${process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://romainlg29.github.io"}${base_path}`;

export const repository =
  process.env.NEXT_PUBLIC_REPOSITORY_URL ??
  "https://github.com/Romainlg29/aeronautic";

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
