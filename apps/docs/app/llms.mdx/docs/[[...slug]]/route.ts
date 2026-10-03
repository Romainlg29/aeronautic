import { notFound } from "next/navigation";
import { page_markdown } from "@/lib/shared";
import { docs_llms, source } from "@/lib/source";

export const revalidate = false;

export const GET = async (
  _request: Request,
  { params }: RouteContext<"/llms.mdx/docs/[[...slug]]">,
) => {
  const { slug } = await params;
  // Without the "content.md" on the end
  const page = source.getPage(slug?.slice(0, -1));

  if (!page) notFound();

  return new Response(await docs_llms.page(page), {
    headers: { "Content-Type": "text/markdown" },
  });
};

export const generateStaticParams = () =>
  source.getPages().map((page) => ({ slug: page_markdown(page).segments }));
