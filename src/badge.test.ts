import { test } from "node:test";
import assert from "node:assert/strict";
import { totalUnread, badgeText } from "./badge.ts";
import type { FeedRecord } from "./storage.ts";

function rec(unread: number): FeedRecord {
  return {
    id: String(unread),
    url: "https://x.test/feed",
    origin: "https://x.test",
    seenGuids: [],
    unread,
    etag: null,
    lastModified: null,
  };
}

test("sums unread across feeds", () => {
  assert.equal(totalUnread([rec(3), rec(0), rec(4)]), 7);
  assert.equal(totalUnread([]), 0);
});

test("badge is blank at zero, numeric otherwise", () => {
  assert.equal(badgeText(0), "");
  assert.equal(badgeText(7), "7");
});
