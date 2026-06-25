import type { ParsedItem } from "./parseFeed.ts";

// The popup <-> background message protocol. Typed in one place so both ends
// stay in sync. The popup only ever READS state (it messages the background,
// which is the single reader/writer of storage.local); it never fetches.
export type GetItemsRequest = { type: "getItems" };

export type GetItemsResponse = { items: ParsedItem[] };
