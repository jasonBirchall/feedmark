import type { FeedRecord } from "./storage.ts";
import type { FetchInput } from "./fetchFeed.ts";

// A minimal structural view of a bookmark node — only the fields we need. Keeps
// this module free of webextension-polyfill (which throws on import outside a
// browser), so the checks below are plain, browser-free unit tests. A real
// browser.bookmarks.BookmarkTreeNode is structurally compatible.
export type BookmarkNode = {
  id: string;
  title: string;
  url?: string;
  children?: BookmarkNode[];
};

// Translate one bookmark into a fresh feed record, or null if it cannot be a
// feed source. https-only and origin-derivation (THREAT_MODEL.md §4) live here,
// on the bookmark path; fetchFeed re-checks both at fetch time (defence in depth).
export function feedFromBookmark(bm: BookmarkNode): FeedRecord | null {
  if (!bm.url) return null; // a folder, or a bookmark with no URL
  let parsed: URL;
  try {
    parsed = new URL(bm.url);
  } catch {
    return null; // malformed URL → not a source; never throws into init()
  }
  if (parsed.protocol !== "https:") return null; // refuse http, fail closed
  return {
    id: bm.id,
    title: bm.title,
    url: bm.url,
    feedUrl: null, // no manual override yet; poll the bookmark URL itself
    origin: parsed.origin,
    seenGuids: [],
    unread: 0,
    resolution: "pending", // first poll decides feed vs no-feed
    etag: null,
    lastModified: null,
    items: [],
  };
}

// Mirror one watched folder into feed records: each direct child bookmark that
// can be a feed source becomes one record; folders, http, and malformed URLs are
// skipped. Direct children only — nesting isn't part of the iter-5 folder AC.
export function feedsFromFolder(folder: BookmarkNode): FeedRecord[] {
  const feeds: FeedRecord[] = [];
  for (const child of folder.children ?? []) {
    const record = feedFromBookmark(child);
    if (record) feeds.push(record);
  }
  return feeds;
}

// What we actually fetch: the pasted feed if present, else the bookmark URL itself.
// `origin` is already pinned to that target's origin (by feedFromBookmark, or by
// subscribe when a feed is pasted), so redirects are checked against the right host.
export function fetchTarget(record: FeedRecord): FetchInput {
  return {
    url: record.feedUrl ?? record.url,
    origin: record.origin,
    etag: record.etag,
    lastModified: record.lastModified,
  };
}

// Reconcile the stored registry against a fresh folder scan, returning the next
// registry to persist. This is how live folder edits land: any bookmark event
// triggers a rescan, and this merge derives the result drift-free —
//   - a bookmark only in the scan  → added as a fresh (un-baselined) feed
//   - a bookmark only in the registry → dropped (removed / moved out)
//   - a bookmark in both, same url → kept with its accumulated state, new title
//   - a bookmark in both, url changed → treated as a new feed (re-baselined)
export function reconcile(current: FeedRecord[], scanned: FeedRecord[]): FeedRecord[] {
  const byId = new Map(current.map((record) => [record.id, record]));
  return scanned.map((fresh) => {
    const existing = byId.get(fresh.id);
    // Same bookmark, same url → keep accumulated state, just adopt any new title.
    if (existing && existing.url === fresh.url) {
      return { ...existing, title: fresh.title };
    }
    // New bookmark, or the url changed → the fresh (un-baselined) record stands.
    return fresh;
  });
}
