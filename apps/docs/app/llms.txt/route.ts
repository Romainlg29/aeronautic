import { docs_llms } from "@/lib/source";

export const revalidate = false;

export const GET = async () => new Response(await docs_llms.index());
