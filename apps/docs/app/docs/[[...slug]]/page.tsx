import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from "fumadocs-ui/layouts/docs/page";
import { createRelativeLink } from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getMDXComponents } from "@/components/mdx";
import { page_markdown, repository } from "@/lib/shared";
import { source } from "@/lib/source";

// Where each library's docs start
const STARTS: Record<string, string> = {
  afterburner: "/docs/afterburner/start/introduction/",
  "wing-vapor": "/docs/wing-vapor/start/introduction/",
};

// The afterburner's sections, which sat at the top of /docs/ before there
// were two libraries
const SECTIONS = [
  "start",
  "tutorial",
  "guides",
  "examples",
  "reference",
  "how-it-works",
];

// The wing vapor's examples, which sat among the afterburner's
const MOVED: Record<string, string[]> = {
  "examples/wing-vapor": ["wing-vapor", "examples", "on-the-fighter"],
  "examples/any-shape": ["wing-vapor", "examples", "any-shape"],
};

/**
 * Where a page from before the split lives now, so old links still land.
 * @param slug The old page's slugs
 * @returns The page's slugs now, or nothing if it never was one
 */
const moved_to = (slug: string[]): string[] | undefined => {
  const wing = MOVED[slug.join("/")];

  if (wing) return wing;

  if (!SECTIONS.includes(slug[0] ?? "")) return undefined;

  return ["afterburner", ...slug];
};

/**
 * One docs page.
 * @param props Its slug
 * @returns The page
 */
const Page = async (props: PageProps<"/docs/[[...slug]]">) => {
  const { slug } = await props.params;

  // /docs/ itself: start at the start
  if (!slug) redirect(STARTS.afterburner as string);

  // A library's own root
  const start = slug.length === 1 ? STARTS[slug[0] as string] : undefined;

  if (start) redirect(start);

  const page = source.getPage(slug);

  if (!page) {
    const moved = moved_to(slug);
    const now = moved && source.getPage(moved);

    if (now) redirect(`${now.url}/`);

    notFound();
  }

  const MDX = page.data.body;
  const markdown = page_markdown(page).url;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription className="mb-0">
        {page.data.description}
      </DocsDescription>
      <div className="flex flex-row items-center gap-2 border-b pb-6">
        <MarkdownCopyButton markdownUrl={markdown} />
        <ViewOptionsPopover
          markdownUrl={markdown}
          githubUrl={`${repository}/blob/main/apps/docs/content/docs/${page.path}`}
        />
      </div>
      <DocsBody>
        <MDX
          components={getMDXComponents({ a: createRelativeLink(source, page) })}
        />
      </DocsBody>
    </DocsPage>
  );
};

export default Page;

export const generateStaticParams = () => {
  const pages = source.getPages();

  // The old URLs, each a redirect to where its page is now
  const legacy = [
    ...pages
      .filter((page) => page.slugs[0] === "afterburner")
      .map((page) => page.slugs.slice(1)),
    ...Object.keys(MOVED).map((path) => path.split("/")),
  ];

  return [
    { slug: [] },
    ...Object.keys(STARTS).map((library) => ({ slug: [library] })),
    ...legacy.map((slug) => ({ slug })),
    ...source.generateParams(),
  ];
};

export const generateMetadata = async (
  props: PageProps<"/docs/[[...slug]]">,
): Promise<Metadata> => {
  const { slug } = await props.params;
  const page = slug ? source.getPage(slug) : undefined;

  if (!page) return {};

  return { title: page.data.title, description: page.data.description };
};
