import { test } from "node:test";
import assert from "node:assert/strict";
import { totalUnread, badgeText } from "./badge.ts";
import { markItemRead } from "./readState.ts";
import type { FeedRecord } from "./storage.ts";
import type { ParsedItem } from "./parseFeed.ts";

function items(guids: string[]): ParsedItem[] {
  return guids.map((guid) => ({ guid, title: guid, link: null }));
}

function rec(id: string, over: Partial<FeedRecord> = {}): FeedRecord {
  return {
    id,
    title: "x",
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

// B5: the badge is the sum of each feed's DERIVED unread — stored items minus
// read ones — never a stored counter.

test("badge sums the derived unread across feeds", () => {
  const feeds = [
    rec("a", { items: items(["a1", "a2", "a3"]), readGuids: ["a2"] }), // 2 unread
    rec("b", { items: items(["b1"]), readGuids: ["b1"] }), // fully read → 0
    rec("c", { items: items(["c1", "c2"]) }), // untouched → 2
  ];
  assert.equal(totalUnread(feeds), 4);
  assert.equal(totalUnread([]), 0);
});

test("reading a source's items zeroes its contribution immediately", () => {
  // B5's clearing half, re-expressed per-item since iter D retired the
  // wholesale clear: each read drops the sum by one, straight to zero.
  const a = rec("a", { items: items(["a1", "a2"]) });
  const b = rec("b", { items: items(["b1"]) });
  assert.equal(totalUnread([a, b]), 3);
  assert.equal(totalUnread([markItemRead(a, "a1"), b]), 2);
  assert.equal(totalUnread([["a1", "a2"].reduce(markItemRead, a), b]), 1); // only b's item remains
});

test("badge is blank at zero, numeric otherwise", () => {
  assert.equal(badgeText(0), "");
  assert.equal(badgeText(7), "7");
});
