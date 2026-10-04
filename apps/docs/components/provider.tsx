"use client";

import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";
import { SearchDialog } from "./search";

/**
 * Theme and search for every page. Dark first: the plumes are graded for it.
 * No theme hotkey: its D is the landing's roll, and every press repainted the
 * whole page through a view transition
 * @param props The page
 * @returns The page, provided for
 */
export const Provider = ({ children }: { children: ReactNode }) => (
  <RootProvider
    search={{ SearchDialog }}
    theme={{ defaultTheme: "dark", enableSystem: false, hotKey: false }}
  >
    {children}
  </RootProvider>
);
