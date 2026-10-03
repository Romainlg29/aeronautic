import { createFromSource } from "fumadocs-core/search/server";
import { source } from "@/lib/source";

export const revalidate = false;

// Written once at export; a .json name so any static host serves it
export const { staticGET: GET } = createFromSource(source, {
  language: "english",
});
