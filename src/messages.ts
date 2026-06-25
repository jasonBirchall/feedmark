import type { ParsedItem } from "./parseFeed.ts";

// The popup <-> background message protocol. Typed in one place so both ends
// stay in sync. The popup only ever READS state (it messages the background,
// which is the single reader/writer of storage.local); it never fetches.
export type GetItemsRequest = { type: "getItems" };

// One source as the popup sees it: the bookmark's id (to clear the right feed),
// its site url (to open on click), title, unread count, and latest items.
// Replaces the flat item list of iter 3/4 with per-source groups.
export type FeedView = {
  id: string;
  url: string;
  title: string;
  unread: number;
  items: ParsedItem[];
};

export type GetItemsResponse = { sources: FeedView[] };

// Fire-and-forget: opening a source clears its unread count. The background is the
// single writer, so the popup asks rather than mutating storage itself.
export type ClearUnreadRequest = { type: "clearUnread"; id: string };
