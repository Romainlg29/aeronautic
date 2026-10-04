import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import type { ReactNode } from "react";
import { Provider } from "@/components/provider";
import { app_name, base_path, description, site_url } from "@/lib/shared";
import "./global.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(`${site_url}/`),
  title: {
    default: `${app_name}: afterburners, wing vapor and control surfaces for three.js`,
    template: `%s · ${app_name}`,
  },
  description,
  keywords: [
    "three.js afterburner",
    "React Three Fiber",
    "r3f",
    "jet engine exhaust",
    "rocket exhaust plume",
    "wing vapor",
    "wingtip vortex",
    "vapor cone",
    "Prandtl-Glauert",
    "control surfaces",
    "thrust vectoring",
    "flight model",
    "shock diamonds",
    "Mach diamonds",
    "WebGPU",
    "TSL",
    "raymarching",
    "VFX",
  ],
  openGraph: { type: "website", siteName: app_name, description },
  icons: { icon: `${base_path}/favicon.svg` },
};

/**
 * Every page's document.
 * @param props The page
 * @returns The document
 */
const Layout = ({ children }: { children: ReactNode }) => (
  <html
    lang="en"
    className={`${sans.variable} ${mono.variable}`}
    suppressHydrationWarning
  >
    <body className="flex min-h-screen flex-col">
      <Provider>{children}</Provider>
    </body>
  </html>
);

export default Layout;
