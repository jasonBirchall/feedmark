import { test } from "node:test";
import assert from "node:assert/strict";
import {
  unreadItems,
  unreadCount,
  markItemRead,
  normalizeRecord,
  type StoredFeedRecord,
} from "./readState.ts";
import { MAX_READ_GUIDS } from "./config.ts";
import type { FeedRecord } from "./storage.ts";
import type { ParsedItem } from "./parseFeed.ts";

function item(over: Partial<ParsedItem> = {}): ParsedItem {
  return { guid: "g", title: "T", link: null, ...over };
}

function record(over: Partial<FeedRecord> = {}): FeedRecord {
  return {
    id: "f",
    title: "f",
    url: "https://x.test/feed",
    feedUrl: null,
    origin: "https://x.test",
    seenGuids: [],
    readGuids: [],
    resolution: "feed",
    etag: null,
    lastModified: null,
    items: [],
    ...over,
  };
}

// B1: the count IS the derivation — stored items minus read ones, nothing else.

test("unread = stored items not marked read (empty, partial, all read)", () => {
  const items = [item({ guid: "a" }), item({ guid: "b" }), item({ guid: "c" })];
  assert.equal(unreadCount(record({ items })), 3); // nothing read → all unread
  assert.deepEqual(
    unreadItems(record({ items, readGuids: ["b"] })).map((i) => i.guid),
    ["a", "c"],
  );
  assert.equal(unreadCount(record({ items, readGuids: ["a", "b", "c"] })), 0);
});

test("a guid reused across two stored items derives as ONE unread item (no inflation)", () => {
  // parseFeed stores duplicate-guid entries as-is; identity is the guid, so the
  // derivation collapses them — an under-count, never badge inflation.
  const rec = record({
    items: [item({ guid: "dup", title: "A" }), item({ guid: "dup", title: "B" })],
  });
  assert.equal(unreadCount(rec), 1);
  assert.deepEqual(
    unreadItems(rec).map((i) => i.title),
    ["A"], // first wins
  );
});

test("a read guid with no stored item contributes nothing (eviction semantics)", () => {
  // The guid of an item long evicted from items[] lingers in readGuids; it must
  // not offset the count of the items actually stored.
  const rec = record({ items: [item({ guid: "new" })], readGuids: ["evicted", "gone"] });
  assert.equal(unreadCount(rec), 1);
});

// Iter D: the wholesale markAllRead died with the source-level clear (customer
// decision); per-item read is the whole model, and it must uphold the same
// invariants the clear did — idempotence, prior history kept, the cap shedding
// only old history.

test("markItemRead marks exactly one item read; the derived count drops by one", () => {
  const rec = record({
    items: [item({ guid: "a" }), item({ guid: "b" }), item({ guid: "c" })],
    readGuids: ["older"],
  });
  const out = markItemRead(rec, "b");
  assert.deepEqual(out.readGuids, ["b", "older"]); // prepended, history kept
  assert.deepEqual(
    unreadItems(out).map((i) => i.guid),
    ["a", "c"], // the read item is gone; its neighbours are untouched
  );
});

test("markItemRead is idempotent (D3): re-marking changes nothing", () => {
  const once = markItemRead(record({ items: [item({ guid: "a" })], readGuids: ["older"] }), "a");
  const twice = markItemRead(once, "a");
  assert.deepEqual(twice.readGuids, ["a", "older"]); // no duplicate, no reorder
  assert.equal(unreadCount(twice), 0);
});

test("readGuids stays bounded: the new guid is PREPENDED and the cap sheds oldest history", () => {
  // History already at the cap; reading a stored item must keep its guid (it
  // goes first) and evict the oldest history guid — never the other way, or a
  // still-stored item could flip back to unread (the iter-B property iter D
  // must preserve).
  const history = Array.from({ length: MAX_READ_GUIDS }, (_, n) => `old${n}`);
  const out = markItemRead(record({ items: [item({ guid: "a" })], readGuids: history }), "a");
  assert.equal(out.readGuids.length, MAX_READ_GUIDS);
  assert.equal(out.readGuids[0], "a");
  assert.equal(out.readGuids.includes(`old${MAX_READ_GUIDS - 1}`), false); // oldest shed
  assert.equal(unreadCount(out), 0);
});

test("read state survives a re-poll that re-serves or reorders the item (D3 inherits B2)", () => {
  const read = markItemRead(record({ items: [item({ guid: "a" }), item({ guid: "b" })] }), "a");
  // A later poll re-serves the same items in a different order, plus a fresh one.
  const repolled = {
    ...read,
    items: [item({ guid: "new" }), item({ guid: "b" }), item({ guid: "a" })],
  };
  assert.deepEqual(
    unreadItems(repolled).map((i) => i.guid),
    ["new", "b"], // "a" stays read; nothing re-counts
  );
});

// B4: old-shape records load without error and behave sanely.

test("a pre-B record (stored unread, no readGuids, linkless items) normalises", () => {
  const stored = {
    id: "old",
    title: "Old",
    url: "https://old.test/feed",
    feedUrl: null,
    origin: "https://old.test",
    seenGuids: ["a", "b"],
    unread: 5, // pre-B counter, possibly drifted
    resolution: "feed",
    etag: null,
    lastModified: null,
    items: [
      { guid: "a", title: "A" },
      { guid: "b", title: "B" },
    ],
  } as StoredFeedRecord;
  const out = normalizeRecord(stored);
  assert.equal("unread" in out, false); // the stored counter is gone for good
  assert.deepEqual(out.readGuids, []); // sane default: derive everything unread
  assert.deepEqual(
    out.items.map((i) => i.link),
    [null, null], // pre-A items never gain a link retroactively
  );
  assert.equal(unreadCount(out), 2); // one-time reset: current items derive unread
  assert.equal(out.seenGuids.length, 2); // dedup history untouched — nothing re-counts
});

test("a current-shape record passes through normalisation unchanged", () => {
  const rec = record({
    items: [item({ guid: "a", link: "https://x.test/a" })],
    readGuids: ["a"],
    seenGuids: ["a"],
  });
  assert.deepEqual(normalizeRecord(rec), rec);
});
