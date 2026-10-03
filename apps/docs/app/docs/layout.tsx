import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { base_options } from "@/lib/layout.shared";
import { source } from "@/lib/source";

/**
 * The docs: sidebar, search and table of contents.
 * @param props The page
 * @returns The layout
 */
const Layout = ({ children }: { children: ReactNode }) => (
  <DocsLayout tree={source.getPageTree()} {...base_options()}>
    {children}
  </DocsLayout>
);

export default Layout;
