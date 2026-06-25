import { test } from "node:test";
import assert from "node:assert/strict";
import { feedFromBookmark, feedsFromFolder, reconcile } from "./source.ts";
import type { FeedRecord } from "./storage.ts";

function feed(over: Partial<FeedRecord> = {}): FeedRecord {
  return {
    id: "a",
    title: "A",
    url: "https://a.test/feed",
    origin: "https://a.test",
    seenGuids: [],
    unread: 0,
    baselined: false,
    etag: null,
    lastModified: null,
    items: [],
    ...over,
  };
}

test("an https bookmark becomes a fresh feed record", () => {
  const rec = feedFromBookmark({
    id: "abc",
    title: "Mozilla Blog",
    url: "https://blog.mozilla.org/feed/",
  });
  assert.equal(rec?.id, "abc");
  assert.equal(rec?.title, "Mozilla Blog");
  assert.equal(rec?.url, "https://blog.mozilla.org/feed/");
  assert.equal(rec?.origin, "https://blog.mozilla.org");
  assert.deepEqual(rec?.seenGuids, []);
  assert.equal(rec?.unread, 0);
  assert.deepEqual(rec?.items, []);
  assert.equal(rec?.etag, null);
  assert.equal(rec?.lastModified, null);
});

test("origin is derived from the host, not the path", () => {
  const rec = feedFromBookmark({
    id: "o",
    title: "Feedmark",
    url: "https://host.example/path/feed.xml",
  });
  assert.equal(rec?.origin, "https://host.example");
});

test("a folder (no url) is not a source", () => {
  assert.equal(feedFromBookmark({ id: "f", title: "Feedmark" }), null);
});

test("an http bookmark is refused (https-only)", () => {
  assert.equal(
    feedFromBookmark({ id: "h", title: "Feedmark", url: "http://blog.mozilla.org/feed/" }),
    null,
  );
});

test("a malformed url is not a source and does not throw", () => {
  assert.equal(feedFromBookmark({ id: "m", title: "Feedmark", url: "not a url" }), null);
});

test("a folder mirrors each child bookmark into a feed record", () => {
  const feeds = feedsFromFolder({
    id: "root",
    title: "Feedmark",
    children: [
      { id: "a", title: "Alpha", url: "https://alpha.test/feed" },
      { id: "b", title: "Beta", url: "https://beta.test/feed" },
    ],
  });
  assert.deepEqual(
    feeds.map((f) => ({ id: f.id, title: f.title, origin: f.origin })),
    [
      { id: "a", title: "Alpha", origin: "https://alpha.test" },
      { id: "b", title: "Beta", origin: "https://beta.test" },
    ],
  );
});

test("a folder skips children that cannot be feed sources", () => {
  const feeds = feedsFromFolder({
    id: "root",
    title: "Feedmark",
    children: [
      { id: "ok", title: "Good", url: "https://good.test/feed" },
      { id: "http", title: "Insecure", url: "http://bad.test/feed" },
      { id: "sub", title: "Nested folder" }, // no url
      { id: "bad", title: "Broken", url: "not a url" },
    ],
  });
  assert.deepEqual(
    feeds.map((f) => f.id),
    ["ok"],
  );
});

test("an empty folder yields no feeds", () => {
  assert.deepEqual(feedsFromFolder({ id: "root", title: "Feedmark", children: [] }), []);
  assert.deepEqual(feedsFromFolder({ id: "root", title: "Feedmark" }), []);
});

test("reconcile adds a newly-scanned bookmark as a fresh feed", () => {
  const current = [feed({ id: "a", baselined: true, unread: 2 })];
  const scanned = [
    feed({ id: "a", baselined: false }),
    feed({ id: "b", title: "B", url: "https://b.test/feed", origin: "https://b.test" }),
  ];
  const next = reconcile(current, scanned);
  assert.deepEqual(
    next.map((f) => f.id),
    ["a", "b"],
  );
  assert.equal(next.find((f) => f.id === "a")?.unread, 2); // existing state kept
  assert.equal(next.find((f) => f.id === "b")?.baselined, false); // new feed baselines on first poll
});

test("reconcile drops a bookmark no longer in the scan", () => {
  const current = [feed({ id: "a" }), feed({ id: "b", url: "https://b.test/feed" })];
  const scanned = [feed({ id: "a" })];
  assert.deepEqual(
    reconcile(current, scanned).map((f) => f.id),
    ["a"],
  );
});

test("reconcile keeps state but adopts the new title on rename", () => {
  const current = [feed({ id: "a", title: "Old", unread: 5, baselined: true, seenGuids: ["x"] })];
  const scanned = [feed({ id: "a", title: "New" })]; // same url
  const a = reconcile(current, scanned)[0];
  assert.equal(a?.title, "New");
  assert.equal(a?.unread, 5);
  assert.equal(a?.baselined, true);
  assert.deepEqual(a?.seenGuids, ["x"]);
});

test("reconcile re-baselines a bookmark whose url changed", () => {
  const current = [
    feed({ id: "a", url: "https://a.test/feed", unread: 5, baselined: true, seenGuids: ["x"] }),
  ];
  const scanned = [feed({ id: "a", url: "https://a.test/rss" })]; // fresh, different url
  const a = reconcile(current, scanned)[0];
  assert.equal(a?.url, "https://a.test/rss");
  assert.equal(a?.baselined, false); // different feed → no inflation from stale GUIDs
  assert.equal(a?.unread, 0);
  assert.deepEqual(a?.seenGuids, []);
});
