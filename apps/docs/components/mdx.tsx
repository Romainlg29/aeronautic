import { Callout } from "fumadocs-ui/components/callout";
import { Card, Cards } from "fumadocs-ui/components/card";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import defaultMdxComponents from "fumadocs-ui/mdx";
import type { FC, ReactNode } from "react";
import { Example, Source } from "./example";

/**
 * Everything a page can use without importing it.
 * Not checked against MDXComponents: R3F puts every three.js class in JSX,
 * and MDXComponents cannot take the ones that are not components
 * @param components Overrides for this page
 * @returns The components
 */
export const getMDXComponents = (
  components?: Record<string, FC<{ children?: ReactNode }>>,
) => ({
  ...defaultMdxComponents,
  Callout,
  Card,
  Cards,
  Example,
  Source,
  Step,
  Steps,
  Tab,
  Tabs,
  ...components,
});

export const useMDXComponents = getMDXComponents;

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
