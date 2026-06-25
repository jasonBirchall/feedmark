import { test } from "node:test";
import assert from "node:assert/strict";
import { pollFeed, pollAll } from "./poll.ts";
import type { FeedRecord } from "./storage.ts";

function record(over: Partial<FeedRecord> = {}): FeedRecord {
  return {
    id: "f",
    url: "https://x.test/feed",
    origin: "https://x.test",
    seenGuids: [],
    unread: 0,
    etag: null,
    lastModified: null,
    ...over,
  };
}

function rssWith(guids: string[]): string {
  const items = guids.map((g) => `<item><guid>${g}</guid></item>`).join("");
  return `<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`;
}

function okFetch(body: string, headers: Record<string, string> = {}) {
  return async () => new Response(body, { status: 200, headers });
}

test("first poll counts every item as new", async () => {
  const out = await pollFeed(record(), {
    fetchImpl: okFetch(rssWith(["a", "b", "c"])),
  });
  assert.ok(out);
  assert.equal(out.unread, 3);
  assert.deepEqual(out.seenGuids, ["a", "b", "c"]);
});

test("re-polling the same items adds nothing", async () => {
  const out = await pollFeed(record({ seenGuids: ["a", "b"], unread: 2 }), {
    fetchImpl: okFetch(rssWith(["a", "b"])),
  });
  assert.ok(out);
  assert.equal(out.unread, 2);
});

test("new items accumulate onto the prior count", async () => {
  const out = await pollFeed(record({ seenGuids: ["a"], unread: 1 }), {
    fetchImpl: okFetch(rssWith(["b", "c", "a"])),
  });
  assert.ok(out);
  assert.equal(out.unread, 3);
  assert.deepEqual(out.seenGuids.slice(0, 2), ["b", "c"]);
});

test("a failed fetch leaves state untouched (null, last-good preserved)", async () => {
  const out = await pollFeed(record({ seenGuids: ["a"], unread: 1 }), {
    fetchImpl: async () => new Response(null, { status: 500 }),
  });
  assert.equal(out, null);
});

test("malformed body does not advance etag (null)", async () => {
  const out = await pollFeed(record({ etag: 'W/"old"' }), {
    fetchImpl: okFetch("not xml", { ETag: 'W/"new"' }),
  });
  assert.equal(out, null);
});

test("seenGuids is bounded to MAX_SEEN_GUIDS", async () => {
  const guids = Array.from({ length: 250 }, (_, n) => `g${n}`);
  const out = await pollFeed(record(), { fetchImpl: okFetch(rssWith(guids)) });
  assert.ok(out);
  assert.equal(out.seenGuids.length, 200);
});

test("pollAll isolates a throwing feed from a healthy sibling", async () => {
  const good = record({
    id: "good",
    url: "https://good.test/feed",
    origin: "https://good.test",
  });
  const bad = record({
    id: "bad",
    url: "https://bad.test/feed",
    origin: "https://bad.test",
  });
  let goodCalls = 0;
  const updates = await pollAll([bad, good], {
    fetchImpl: async (url) => {
      if (String(url).includes("bad.test")) throw new Error("boom");
      goodCalls += 1;
      return new Response(rssWith(["x"]), { status: 200 });
    },
  });
  // The healthy feed still polls and updates; the throwing one yields nothing,
  // and the batch resolves rather than rejecting.
  assert.equal(goodCalls, 1);
  assert.deepEqual(
    updates.map((r) => r.id),
    ["good"],
  );
});
