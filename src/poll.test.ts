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
    baselined: true, // default: an established feed; baseline tests pass false
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

function rssWithTitles(pairs: { guid: string; title: string }[]): string {
  const items = pairs
    .map((p) => `<item><title>${p.title}</title><guid>${p.guid}</guid></item>`)
    .join("");
  return `<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`;
}

function okFetch(body: string, headers: Record<string, string> = {}) {
  return async () => new Response(body, { status: 200, headers });
}

test("first poll baselines every item as seen (no badge inflation)", async () => {
  const out = await pollFeed(record({ baselined: false }), {
    fetchImpl: okFetch(rssWith(["a", "b", "c"])),
  });
  assert.ok(out);
  assert.equal(out.unread, 0); // a freshly registered feed starts clean
  assert.deepEqual(out.seenGuids, ["a", "b", "c"]); // all marked seen
  assert.equal(out.baselined, true); // and won't baseline again
});

test("items appearing after baseline count as unread", async () => {
  // already baselined on ["a", "b"]; only "c" is genuinely new
  const out = await pollFeed(record({ seenGuids: ["a", "b"], baselined: true }), {
    fetchImpl: okFetch(rssWith(["c", "a", "b"])),
  });
  assert.ok(out);
  assert.equal(out.unread, 1);
  assert.equal(out.seenGuids[0], "c");
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

test("a successful poll persists the parsed items for rendering", async () => {
  const out = await pollFeed(record(), {
    fetchImpl: okFetch(
      rssWithTitles([
        { guid: "a", title: "Alpha" },
        { guid: "b", title: "Beta" },
      ]),
    ),
  });
  assert.ok(out);
  assert.deepEqual(out.items, [
    { guid: "a", title: "Alpha" },
    { guid: "b", title: "Beta" },
  ]);
});

test("each poll replaces the stored items with the latest parse", async () => {
  const out = await pollFeed(
    record({ items: [{ guid: "old", title: "Old" }], seenGuids: ["old"], unread: 1 }),
    { fetchImpl: okFetch(rssWithTitles([{ guid: "new", title: "New" }])) },
  );
  assert.ok(out);
  assert.deepEqual(out.items, [{ guid: "new", title: "New" }]);
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
