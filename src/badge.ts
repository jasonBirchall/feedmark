import { unreadCount } from "./readState.ts";
import type { FeedRecord } from "./storage.ts";

// Pure badge helpers. Kept free of any webextension-polyfill import so they are
// unit-testable under Node (the polyfill throws when loaded outside a browser).
// The actual browser write lives in background.ts, the impure shell.

// The badge is the sum of each feed's DERIVED unread (iter B): items minus
// readGuids, via the one shared predicate. Inflation is bounded by the parser's
// MAX_ITEMS cap on each items[] — there is no stored counter to drift or spoof.
export function totalUnread(feeds: FeedRecord[]): number {
  return feeds.reduce((sum, f) => sum + unreadCount(f), 0);
}

export function badgeText(total: number): string {
  return total > 0 ? String(total) : "";
}
