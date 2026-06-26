import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveSubscription } from "./subscribe.ts";
import type { FeedRecord } from "./storage.ts";

function record(over: Partial<FeedRecord> = {}): FeedRecord {
  return {
    id: "s",
    title: "Source",
    url: "https://site.test/",
    feedUrl: null,
    origin: "https://site.test",
    seenGuids: [],
    unread: 0,
    resolution: "no-feed",
    etag: null,
    lastModified: null,
    items: [],
    ...over,
  };
}

function rssWith(guids: string[]): string {
  const items = guids.map((g) => `<item><guid>${g}</guid></item>`).join("");
  return `<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`;
}

const okFetch = (body: string) => async () => new Response(body, { status: 200 });

test("an http paste is refused synchronously, with no fetch", async () => {
  let fetched = false;
  const out = await resolveSubscription(record(), "http://site.test/feed", {
    fetchImpl: async () => {
      fetched = true;
      return new Response("", { status: 200 });
    },
  });
  assert.deepEqual(out, { ok: false, reason: "not-https" });
  assert.equal(fetched, false);
});

test("a garbage (non-URL) paste is refused as not-https", async () => {
  const out = await resolveSubscription(record(), "not a url");
  assert.deepEqual(out, { ok: false, reason: "not-https" });
});

test("an https paste that is not a feed is rejected and not persisted", async () => {
  const out = await resolveSubscription(record(), "https://site.test/page", {
    fetchImpl: okFetch("<html>not a feed</html>"),
  });
  assert.deepEqual(out, { ok: false, reason: "no-feed" });
});

test("an unreachable https paste is reported unreachable", async () => {
  const out = await resolveSubscription(record(), "https://site.test/feed", {
    fetchImpl: async () => new Response(null, { status: 500 }),
  });
  assert.deepEqual(out, { ok: false, reason: "unreachable" });
});

test("a valid feed paste subscribes: feedUrl set, origin re-pinned, baselined clean", async () => {
  const out = await resolveSubscription(record(), "https://feeds.example/atom.xml", {
    fetchImpl: okFetch(rssWith(["a", "b"])),
  });
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.record.feedUrl, "https://feeds.example/atom.xml");
  assert.equal(out.record.origin, "https://feeds.example"); // re-pinned to the pasted feed
  assert.equal(out.record.resolution, "feed");
  assert.equal(out.record.unread, 0); // no badge inflation on subscribe
  assert.deepEqual(out.record.seenGuids, ["a", "b"]);
  assert.equal(out.record.url, "https://site.test/"); // click-through unchanged
});
