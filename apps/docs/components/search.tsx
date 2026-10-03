"use client";

import { useDocsSearch } from "fumadocs-core/search/client";
import { staticClient } from "fumadocs-core/search/client/orama-static";
import {
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  SearchDialog as Dialog,
  type SharedProps,
} from "fumadocs-ui/components/dialog/search";
import { base_path } from "@/lib/shared";

// The index is built once, at export, and searched in the browser
const client = staticClient({ from: `${base_path}/search.json` });

/**
 * The search dialog, over the static index.
 * @param props Open state, from the provider
 * @returns The dialog
 */
export const SearchDialog = (props: SharedProps) => {
  const { search, setSearch, query } = useDocsSearch({ client });

  return (
    <Dialog
      search={search}
      onSearchChange={setSearch}
      isLoading={query.isLoading}
      {...props}
    >
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList items={query.data !== "empty" ? query.data : null} />
      </SearchDialogContent>
    </Dialog>
  );
};
