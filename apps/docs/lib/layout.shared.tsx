import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { app_name, base_path, repository } from "./shared";

/**
 * What the landing page and the docs share: the title, the links, GitHub.
 * @returns The layout's options
 */
export const base_options = (): BaseLayoutProps => ({
  nav: {
    title: (
      <>
        {/* A plain <img>: Next does not prefix a src with the base path */}
        <img src={`${base_path}/logo.svg`} alt="" width={24} height={24} />
        <span className="font-semibold">{app_name}</span>
      </>
    ),
  },
  githubUrl: repository,
  links: [
    { text: "Docs", url: "/docs/start/introduction/", active: "nested-url" },
    { text: "Examples", url: "/docs/examples/basic-jet/" },
  ],
});
