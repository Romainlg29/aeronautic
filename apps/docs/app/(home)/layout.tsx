import { HomeLayout } from "fumadocs-ui/layouts/home";
import type { ReactNode } from "react";
import { base_options } from "@/lib/layout.shared";

/**
 * The landing page's frame: the nav bar, without the sidebar.
 * @param props The page
 * @returns The layout
 */
const Layout = ({ children }: { children: ReactNode }) => (
  <HomeLayout {...base_options()}>{children}</HomeLayout>
);

export default Layout;
