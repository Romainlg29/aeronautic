"use client";

import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";
import { SearchDialog } from "./search";

/**
 * Theme and search for every page. Dark first: the plumes are graded for it.
 * @param props The page
 * @returns The page, provided for
 */
export const Provider = ({ children }: { children: ReactNode }) => (
  <RootProvider
    search={{ SearchDialog }}
    theme={{ defaultTheme: "dark", enableSystem: false }}
  >
    {children}
  </RootProvider>
);
