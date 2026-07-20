import type { ParsedItem } from "./parseFeed.ts";
import type { SubscribeReason } from "./subscribe.ts";
import type { FeedResolution } from "./storage.ts";

// The popup <-> background message protocol. Typed in one place so both ends
// stay in sync. The popup only ever READS state (it messages the background,
// which is the single reader/writer of storage.local); it never fetches.
export type GetItemsRequest = { type: "getItems" };

// One source as the popup sees it: the bookmark's id (to clear the right feed),
// its site url (to open on click), title, unread count, and latest items.
// Replaces the flat item list of iter 3/4 with per-source groups. Since iter B
// `unread` is computed by the background from derived state (readState.ts);
// the popup-facing shape is unchanged.
export type FeedView = {
  id: string;
  url: string;
  title: string;
  unread: number;
  items: ParsedItem[];
  state: FeedResolution; // "feed" → show items; otherwise → show the paste field
};

export type GetItemsResponse = { sources: FeedView[] };

// Fire-and-forget: opening a source clears its unread count. The background is the
// single writer, so the popup asks rather than mutating storage itself.
export type ClearUnreadRequest = { type: "clearUnread"; id: string };

// Subscribe a no-feed source by pasting an https feed URL. The popup messages the
// background (the only fetcher); the background replies with the resolved source or
// a typed reason the popup renders inline.
export type SubscribeRequest = { type: "subscribe"; id: string; feedUrl: string };

export type SubscribeResponse =
  | { ok: true; source: FeedView }
  | { ok: false; reason: SubscribeReason };
