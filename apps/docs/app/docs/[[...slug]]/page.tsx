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

/**
 * One docs page.
 * @param props Its slug
 * @returns The page
 */
const Page = async (props: PageProps<"/docs/[[...slug]]">) => {
  const { slug } = await props.params;

  // /docs/ itself: start at the start
  if (!slug) redirect("/docs/start/introduction/");

  const page = source.getPage(slug);

  if (!page) notFound();

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

export const generateStaticParams = () => [
  { slug: [] },
  ...source.generateParams(),
];

export const generateMetadata = async (
  props: PageProps<"/docs/[[...slug]]">,
): Promise<Metadata> => {
  const { slug } = await props.params;
  const page = slug ? source.getPage(slug) : undefined;

  if (!page) return {};

  return { title: page.data.title, description: page.data.description };
};
