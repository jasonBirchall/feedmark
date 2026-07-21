import { MAX_READ_GUIDS } from "./config.ts";
import type { FeedRecord } from "./storage.ts";
import type { ParsedItem } from "./parseFeed.ts";

// Per-item read state, pure and polyfill-free so it unit-tests under Node.
// *Read* is distinct from *seen*: seen = counted once for dedup (poll.ts);
// read = the human clicked it. Unread is DERIVED — a source's count is its
// stored items minus its read ones, so the list and the pill can never
// disagree: they come from the same predicate (iter B). An item evicted from
// items[] by MAX_ITEMS simply stops contributing, read or not.

// The one shared unread predicate. Everything that needs "which items are
// unread" (badge sum, popup counts, the iter-C window) derives through here —
// one helper, never a re-implementation. A guid IS an item's identity, so a
// buggy/hostile feed reusing one guid across entries yields one unread item
// (first wins), not several — parseFeed stores duplicates as-is, and the old
// counter's seen-set dedup collapsed them, so the derivation must too or the
// badge inflates on exactly the input the dedup tests guard.
export function unreadItems(record: Pick<FeedRecord, "items" | "readGuids">): ParsedItem[] {
  const read = new Set(record.readGuids);
  const unread: ParsedItem[] = [];
  for (const item of record.items) {
    if (read.has(item.guid)) continue;
    read.add(item.guid); // later duplicates of this guid are the same item
    unread.push(item);
  }
  return unread;
}

export function unreadCount(record: Pick<FeedRecord, "items" | "readGuids">): number {
  return unreadItems(record).length;
}

// The human dismissed a whole source (iter D.1): every currently-stored item
// read at once. Restored from iter B's clearUnread internals — per-item read
// alone turned out unable to dismiss a LINKED item without opening it, so the
// wholesale verb returned as an explicit affordance. Current guids go first so
// the cap can only ever evict guids of items already gone from items[]; a guid
// past the cap whose item still rendered would flip the item back to unread.
export function markAllRead(record: FeedRecord): FeedRecord {
  const merged = new Set([...record.items.map((item) => item.guid), ...record.readGuids]);
  return { ...record, readGuids: [...merged].slice(0, MAX_READ_GUIDS) };
}

// The human clicked one item (iter D). The guid is PREPENDED, never appended,
// preserving the same cap property as markAllRead: what the cap evicts is
// always the oldest history — guids of items long gone from items[] — so a
// still-stored item can never flip back to unread. Idempotent: marking a read
// item read again changes nothing, so a
// re-sent message or a double-click can't churn the history order.
export function markItemRead(record: FeedRecord, guid: string): FeedRecord {
  if (record.readGuids.includes(guid)) return record;
  return { ...record, readGuids: [guid, ...record.readGuids].slice(0, MAX_READ_GUIDS) };
}

// What older installs may hold in storage.local: records written before
// readGuids existed (pre-B) still carry a stored `unread` counter, and their
// items predate `link` (pre-A). Migration happens here, at the read boundary,
// by defaulting — not via a versioned-migration framework.
export type StoredFeedRecord = Omit<FeedRecord, "readGuids" | "items"> & {
  readGuids?: string[];
  unread?: number; // pre-B stored counter — discarded; unread is derived now
  items?: (Omit<ParsedItem, "link"> & { link?: string | null })[];
};

// Normalise one stored record to the current shape: missing readGuids → empty
// (its items derive as unread — for a cleared pre-B source that's a one-time
// reset, accepted in-session as the sane migration), missing item link → null
// (never trusted retroactively; only the parser gate admits links), stale
// `unread` stripped so the next write drops it from storage for good.
export function normalizeRecord(stored: StoredFeedRecord): FeedRecord {
  const record = {
    ...stored,
    readGuids: stored.readGuids ?? [],
    items: (stored.items ?? []).map((item) => ({ ...item, link: item.link ?? null })),
  };
  delete record.unread;
  return record;
}
