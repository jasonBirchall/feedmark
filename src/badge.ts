import type { FeedRecord } from "./storage.ts";

// Pure badge helpers. Kept free of any webextension-polyfill import so they are
// unit-testable under Node (the polyfill throws when loaded outside a browser).
// The actual browser write lives in background.ts, the impure shell.

export function totalUnread(feeds: FeedRecord[]): number {
  return feeds.reduce((sum, f) => sum + f.unread, 0);
}

export function badgeText(total: number): string {
  return total > 0 ? String(total) : "";
}
