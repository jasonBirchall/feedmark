import type { FeedRecord } from "./storage.ts";

// A minimal structural view of a bookmark node — only the fields we need. Keeps
// this module free of webextension-polyfill (which throws on import outside a
// browser), so the checks below are plain, browser-free unit tests. A real
// browser.bookmarks.BookmarkTreeNode is structurally compatible.
export type BookmarkNode = { id: string; title: string; url?: string };

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
