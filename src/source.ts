import type { FeedRecord } from "./storage.ts";

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
    origin: parsed.origin,
    seenGuids: [],
    unread: 0,
    baselined: false, // first poll will baseline current items as seen
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
