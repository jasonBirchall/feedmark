import type { ParsedItem } from "./parseFeed.ts";
import type { SubscribeReason } from "./subscribe.ts";
import type { FeedResolution } from "./storage.ts";
import type { FolderChoice } from "./folders.ts";

// The popup <-> background message protocol. Typed in one place so both ends
// stay in sync. The popup only ever READS state (it messages the background,
// which is the single reader/writer of storage.local); it never fetches.
export type GetItemsRequest = { type: "getItems" };

// One source as the popup sees it: the bookmark's id, title, unread count, and
// its UNREAD items (since iter C both derive through readState's one shared
// predicate in the background — the popup renders the list as given and never
// re-filters, so pill and rows agree by construction). The bookmark's site url
// left the view in iter D: nothing had rendered it since the header
// click-through died with the fold (customer decision, iter C).
export type FeedView = {
  id: string;
  title: string;
  unread: number;
  items: ParsedItem[];
  state: FeedResolution; // "feed" → show items; otherwise → show the paste field
};

// How the popup tells its empty states apart (iter E): "none" = no folder
// chosen yet (fresh install) and "missing" = the chosen folder was deleted —
// both prompt for the options page, the latter with stored records preserved
// (fail safe); "ok" = the folder resolves, so an empty source list just means
// an empty folder.
export type FolderStatus = "ok" | "none" | "missing";

export type GetItemsResponse = { folder: FolderStatus; sources: FeedView[] };

// The options page's read (iter E): every bookmark folder, flat and
// path-labelled, plus the current choice. Request/response like getItems.
export type GetFoldersRequest = { type: "getFolders" };

export type GetFoldersResponse = { folders: FolderChoice[]; currentId: string | null };

// Choose the watched folder (iter E). Request/response: the background — the
// single writer, for settings as for feeds — persists the id, rescans and
// reconciles, then replies; polling continues asynchronously and the badge
// follows (customer decision: reply after persist + scan, not the full poll).
// ok: false = the folder vanished since it was listed; nothing changed.
export type SetFolderRequest = { type: "setFolder"; id: string };

export type SetFolderResponse = { ok: boolean };

// Fire-and-forget: the human clicked one item (iter D). No reply — for a linked
// item the new tab steals focus and closes the popup anyway; on reopen the
// derived state is simply correct. Replaces the retired source-level
// clearUnread, whose wholesale-clear semantics died with the header
// click-through (customer decision, iters C/D).
export type MarkItemReadRequest = { type: "markItemRead"; id: string; guid: string };

// Fire-and-forget: mark a whole source read (iter D.1). Not the retired
// clearUnread returning by the back door: that was a side effect of opening the
// site; this is an explicit action row under the expanded fold. It exists
// because per-item read cannot dismiss a LINKED item without opening it.
export type MarkSourceReadRequest = { type: "markSourceRead"; id: string };

// Subscribe a no-feed source by pasting an https feed URL. The popup messages the
// background (the only fetcher); the background replies with the resolved source or
// a typed reason the popup renders inline.
export type SubscribeRequest = { type: "subscribe"; id: string; feedUrl: string };

export type SubscribeResponse =
  | { ok: true; source: FeedView }
  | { ok: false; reason: SubscribeReason };
