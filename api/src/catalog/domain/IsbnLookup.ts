import type { IsbnLookupBook } from "@slm/contracts";

export type { IsbnLookupBook };
export type IsbnLookupResult =
  { found: true; book: IsbnLookupBook } | { found: false; reason: "not_found" | "timeout" | "unavailable" };

/** Port: looks a normalised ISBN up in an external catalog. Never throws; failures are results. */
export interface IsbnLookup {
  lookup(isbn: string): Promise<IsbnLookupResult>;
}
