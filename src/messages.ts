import type { ParsedItem } from "./parseFeed.ts";

// The popup <-> background message protocol. Typed in one place so both ends
// stay in sync. The popup only ever READS state (it messages the background,
// which is the single reader/writer of storage.local); it never fetches.
export type GetItemsRequest = { type: "getItems" };

// One source as the popup sees it: the bookmark's title, its unread count, and
// its latest items. Replaces the flat item list of iter 3/4 with per-source groups.
export type FeedView = { title: string; unread: number; items: ParsedItem[] };

export type GetItemsResponse = { sources: FeedView[] };
