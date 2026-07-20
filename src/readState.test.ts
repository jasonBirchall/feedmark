import { test } from "node:test";
import assert from "node:assert/strict";
import {
  unreadItems,
  unreadCount,
  markAllRead,
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

test("markAllRead marks every current item read and keeps prior history", () => {
  const rec = record({
    items: [item({ guid: "a" }), item({ guid: "b" })],
    readGuids: ["older"],
  });
  const out = markAllRead(rec);
  assert.deepEqual(out.readGuids, ["a", "b", "older"]); // current first, history kept
  assert.equal(unreadCount(out), 0); // B5's per-source half: cleared → zero, derived
});

test("markAllRead is idempotent (no duplicate guids)", () => {
  const once = markAllRead(record({ items: [item({ guid: "a" })] }));
  const twice = markAllRead(once);
  assert.deepEqual(twice.readGuids, ["a"]);
});

test("readGuids is bounded, and the cap evicts old history, never current items", () => {
  // Prior history already at the cap; marking two current items read must keep
  // both current guids (they sort first) and shed the oldest history instead.
  const history = Array.from({ length: MAX_READ_GUIDS }, (_, n) => `old${n}`);
  const out = markAllRead(
    record({ items: [item({ guid: "a" }), item({ guid: "b" })], readGuids: history }),
  );
  assert.equal(out.readGuids.length, MAX_READ_GUIDS);
  assert.deepEqual(out.readGuids.slice(0, 2), ["a", "b"]);
  assert.equal(unreadCount(out), 0); // every stored item still reads as read
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
