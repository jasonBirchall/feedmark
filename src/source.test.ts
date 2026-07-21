import { test } from "node:test";
import assert from "node:assert/strict";
import {
  feedFromBookmark,
  feedsFromFolder,
  nextRegistry,
  reconcile,
  fetchTarget,
} from "./source.ts";
import type { FeedRecord } from "./storage.ts";

function feed(over: Partial<FeedRecord> = {}): FeedRecord {
  return {
    id: "a",
    title: "A",
    url: "https://a.test/feed",
    feedUrl: null,
    origin: "https://a.test",
    seenGuids: [],
    readGuids: [],
    resolution: "pending",
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
  assert.equal(rec?.feedUrl, null);
  assert.equal(rec?.resolution, "pending");
  assert.deepEqual(rec?.seenGuids, []);
  assert.deepEqual(rec?.readGuids, []); // nothing read → everything derives unread
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
  const current = [feed({ id: "a", resolution: "feed", readGuids: ["x"] })];
  const scanned = [
    feed({ id: "a", resolution: "pending" }),
    feed({ id: "b", title: "B", url: "https://b.test/feed", origin: "https://b.test" }),
  ];
  const next = reconcile(current, scanned);
  assert.deepEqual(
    next.map((f) => f.id),
    ["a", "b"],
  );
  assert.deepEqual(next.find((f) => f.id === "a")?.readGuids, ["x"]); // existing state kept
  assert.equal(next.find((f) => f.id === "b")?.resolution, "pending"); // new feed baselines on first poll
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
  const current = [
    feed({ id: "a", title: "Old", readGuids: ["r"], resolution: "feed", seenGuids: ["x"] }),
  ];
  const scanned = [feed({ id: "a", title: "New" })]; // same url
  const a = reconcile(current, scanned)[0];
  assert.equal(a?.title, "New");
  assert.deepEqual(a?.readGuids, ["r"]);
  assert.equal(a?.resolution, "feed");
  assert.deepEqual(a?.seenGuids, ["x"]);
});

test("fetchTarget fetches the bookmark url when no feed is pasted", () => {
  const t = fetchTarget(feed({ url: "https://a.test/", feedUrl: null }));
  assert.equal(t.url, "https://a.test/");
});

test("fetchTarget fetches the pasted feed url when present", () => {
  const t = fetchTarget(feed({ url: "https://a.test/", feedUrl: "https://a.test/atom.xml" }));
  assert.equal(t.url, "https://a.test/atom.xml");
  assert.equal(t.origin, "https://a.test"); // the record's pinned origin
});

// The fail-safe decision (iter E, E5): a MISSING folder — deleted, maybe
// transiently — changes nothing. Read state survives; the popup prompts to
// re-choose instead of the registry being reconciled against nothing.
test("a missing folder keeps the registry — and its read state — untouched", () => {
  const current = [feed({ id: "a", readGuids: ["r"], resolution: "feed" })];
  assert.deepEqual(nextRegistry(current, { status: "missing" }), current);
});

test("no chosen folder keeps the registry untouched", () => {
  const current = [feed({ id: "a" })];
  assert.deepEqual(nextRegistry(current, { status: "none" }), current);
});

// ...but a folder that EXISTS and is empty means the user emptied it: the
// records go. Missing and empty are distinct on purpose (iter E).
test("an ok scan of an empty folder drops every record", () => {
  const current = [feed({ id: "a" }), feed({ id: "b" })];
  assert.deepEqual(nextRegistry(current, { status: "ok", feeds: [] }), []);
});

// The switching cost, accepted honestly (customer decision, iter E): choosing
// a different folder drops the old folder's records, read state included —
// switching back later re-baselines those sources as unread.
test("switching folders drops the old folder's records and their read state", () => {
  const current = [feed({ id: "old", readGuids: ["r"], resolution: "feed" })];
  const scanned = [feed({ id: "new", url: "https://new.test/feed" })];
  const next = nextRegistry(current, { status: "ok", feeds: scanned });
  assert.deepEqual(
    next.map((f) => f.id),
    ["new"],
  );
  assert.equal(next[0]?.resolution, "pending"); // fresh — baselines on first poll
});

test("reconcile re-baselines a bookmark whose url changed", () => {
  const current = [
    feed({
      id: "a",
      url: "https://a.test/feed",
      readGuids: ["r"],
      resolution: "feed",
      seenGuids: ["x"],
    }),
  ];
  const scanned = [feed({ id: "a", url: "https://a.test/rss" })]; // fresh, different url
  const a = reconcile(current, scanned)[0];
  assert.equal(a?.url, "https://a.test/rss");
  assert.equal(a?.resolution, "pending"); // different feed → no inflation from stale GUIDs
  assert.deepEqual(a?.readGuids, []);
  assert.deepEqual(a?.seenGuids, []);
});
