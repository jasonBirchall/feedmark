import { test } from "node:test";
import assert from "node:assert/strict";
import { pollFeed, pollAll, type PollLogger } from "./poll.ts";
import type { FeedRecord } from "./storage.ts";

// A logger that records what autodiscovery narrated, so tests assert on the reason.
function capture(): { logger: PollLogger; logs: { level: string; msg: string }[] } {
  const logs: { level: string; msg: string }[] = [];
  return {
    logs,
    logger: {
      info: (...a: unknown[]) => logs.push({ level: "info", msg: a.join(" ") }),
      warn: (...a: unknown[]) => logs.push({ level: "warn", msg: a.join(" ") }),
    },
  };
}

// Dispatch fetches by URL, so a homepage and its discovered feed can each respond.
function routeFetch(
  routes: Record<string, () => Response>,
  onCall?: (url: string) => void,
): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    const u = String(url);
    onCall?.(u);
    return (routes[u] ?? (() => new Response(null, { status: 404 })))();
  }) as typeof fetch;
}

// An HTML page that advertises a single feed at `href`.
function pageAdvertising(href: string): string {
  return `<!doctype html><head><link rel="alternate" type="application/rss+xml" href="${href}"></head>`;
}

function record(over: Partial<FeedRecord> = {}): FeedRecord {
  return {
    id: "f",
    title: "f",
    url: "https://x.test/feed",
    feedUrl: null,
    origin: "https://x.test",
    seenGuids: [],
    unread: 0,
    resolution: "feed", // default: an established feed; baseline tests pass "pending"
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

// Items carrying neither guid nor link — identified only by their title.
function rssTitleOnly(titles: string[]): string {
  const items = titles.map((t) => `<item><title>${t}</title></item>`).join("");
  return `<?xml version="1.0"?><rss version="2.0"><channel>${items}</channel></rss>`;
}

function okFetch(body: string, headers: Record<string, string> = {}) {
  return async () => new Response(body, { status: 200, headers });
}

test("first poll baselines every item as seen (no badge inflation)", async () => {
  const out = await pollFeed(record({ resolution: "pending" }), {
    fetchImpl: okFetch(rssWith(["a", "b", "c"])),
  });
  assert.ok(out);
  assert.equal(out.unread, 0); // a freshly registered feed starts clean
  assert.deepEqual(out.seenGuids, ["a", "b", "c"]); // all marked seen
  assert.equal(out.resolution, "feed"); // and won't baseline again
});

test("items appearing after baseline count as unread", async () => {
  // already baselined on ["a", "b"]; only "c" is genuinely new
  const out = await pollFeed(record({ seenGuids: ["a", "b"], resolution: "feed" }), {
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

test("a title-identified item baselines clean and is not re-counted next poll", async () => {
  // A feed whose items have only titles. The title is the synthesised identity;
  // because it's stable across polls, the item is seen once and never re-counted.
  const baselined = await pollFeed(record({ resolution: "pending" }), {
    fetchImpl: okFetch(rssTitleOnly(["Daily News"])),
  });
  assert.ok(baselined);
  assert.equal(baselined.unread, 0); // baselined, no badge inflation
  assert.deepEqual(baselined.seenGuids, ["Daily News"]); // kept, identified by title

  const repoll = await pollFeed(baselined, {
    fetchImpl: okFetch(rssTitleOnly(["Daily News"])),
  });
  assert.ok(repoll);
  assert.equal(repoll.unread, 0); // same title → same identity → not new
});

test("a feed reusing one guid across two items counts it once (no inflation)", async () => {
  // A buggy/hostile feed hands two distinct items the same guid. Dedup collapses
  // them to a single new item — an under-count, never the badge inflation AC1 guards.
  const out = await pollFeed(record({ seenGuids: ["old"], unread: 0 }), {
    fetchImpl: okFetch(rssWith(["dup", "dup"])),
  });
  assert.ok(out);
  assert.equal(out.unread, 1); // one new identity, not two
});

test("seenGuids is bounded to MAX_SEEN_GUIDS", async () => {
  const guids = Array.from({ length: 250 }, (_, n) => `g${n}`);
  const out = await pollFeed(record(), { fetchImpl: okFetch(rssWith(guids)) });
  assert.ok(out);
  assert.equal(out.seenGuids.length, 200);
});

test("a fetched-but-unparseable bookmark becomes no-feed (not null)", async () => {
  const { logger, logs } = capture();
  const out = await pollFeed(record({ resolution: "pending", etag: 'W/"old"' }), {
    fetchImpl: okFetch("<html>not a feed</html>", { ETag: 'W/"new"' }),
    logger,
  });
  assert.ok(out);
  assert.equal(out.resolution, "no-feed");
  assert.equal(out.etag, 'W/"old"'); // unparseable body is never last-good: etag NOT advanced
  assert.ok(logs.some((l) => l.level === "warn" && l.msg.includes("no feed link")));
});

test("autodiscovers a same-origin feed advertised by the bookmark page", async () => {
  const { logger, logs } = capture();
  let calls = 0;
  const out = await pollFeed(
    record({ url: "https://site.test/", origin: "https://site.test", resolution: "pending" }),
    {
      fetchImpl: routeFetch(
        {
          "https://site.test/": () =>
            new Response(pageAdvertising("https://site.test/feed.xml"), { status: 200 }),
          "https://site.test/feed.xml": () => new Response(rssWith(["a", "b"]), { status: 200 }),
        },
        () => {
          calls += 1;
        },
      ),
      logger,
    },
  );
  assert.ok(out);
  assert.equal(out.resolution, "feed");
  assert.equal(out.feedUrl, "https://site.test/feed.xml"); // discovered feed pinned
  assert.equal(out.origin, "https://site.test");
  assert.equal(out.url, "https://site.test/"); // click-through unchanged
  assert.equal(out.unread, 0); // baselined clean, no badge inflation
  assert.deepEqual(out.seenGuids, ["a", "b"]);
  assert.equal(calls, 2); // homepage + the one discovered feed, nothing more
  assert.ok(logs.some((l) => l.level === "info" && l.msg.includes("autodiscovered feed")));
});

test("refuses a cross-origin-only advertised feed and never fetches it (the gate)", async () => {
  const { logger, logs } = capture();
  const fetched: string[] = [];
  const out = await pollFeed(
    record({ url: "https://site.test/", origin: "https://site.test", resolution: "pending" }),
    {
      fetchImpl: routeFetch(
        {
          "https://site.test/": () =>
            new Response(pageAdvertising("https://feeds.evil.test/x.xml"), { status: 200 }),
        },
        (u) => fetched.push(u),
      ),
      logger,
    },
  );
  assert.ok(out);
  assert.equal(out.resolution, "no-feed"); // not auto-trusted → falls back to paste
  assert.deepEqual(fetched, ["https://site.test/"]); // the off-origin feed is never fetched
  assert.ok(logs.some((l) => l.level === "warn" && l.msg.includes("cross-origin")));
});

test("a page advertising no feed settles to no-feed with a warning", async () => {
  const { logger, logs } = capture();
  const out = await pollFeed(record({ url: "https://site.test/", resolution: "pending" }), {
    fetchImpl: okFetch("<html><head><title>No feed here</title></head></html>"),
    logger,
  });
  assert.ok(out);
  assert.equal(out.resolution, "no-feed");
  assert.ok(logs.some((l) => l.level === "warn" && l.msg.includes("no feed link")));
});

test("an unreachable discovered candidate stays pending to retry, not no-feed", async () => {
  const { logger, logs } = capture();
  const out = await pollFeed(
    record({ url: "https://site.test/", origin: "https://site.test", resolution: "pending" }),
    {
      fetchImpl: routeFetch({
        "https://site.test/": () =>
          new Response(pageAdvertising("https://site.test/feed.xml"), { status: 200 }),
        "https://site.test/feed.xml": () => new Response(null, { status: 503 }),
      }),
      logger,
    },
  );
  assert.equal(out, null); // resolution untouched → still pending, next poll retries
  assert.ok(logs.some((l) => l.level === "warn" && l.msg.includes("unreachable")));
});

test("a discovered candidate that isn't a feed settles to no-feed", async () => {
  const { logger, logs } = capture();
  const out = await pollFeed(
    record({ url: "https://site.test/", origin: "https://site.test", resolution: "pending" }),
    {
      fetchImpl: routeFetch({
        "https://site.test/": () =>
          new Response(pageAdvertising("https://site.test/feed.xml"), { status: 200 }),
        "https://site.test/feed.xml": () =>
          new Response("<html>still not a feed</html>", { status: 200 }),
      }),
      logger,
    },
  );
  assert.ok(out);
  assert.equal(out.resolution, "no-feed");
  assert.ok(logs.some((l) => l.level === "warn" && l.msg.includes("0 items")));
});

test("an already-no-feed bookmark with still no feed yields null (no needless write)", async () => {
  const out = await pollFeed(record({ resolution: "no-feed" }), {
    fetchImpl: okFetch("<html>still not a feed</html>"),
  });
  assert.equal(out, null);
});

test("a transient fetch failure leaves resolution untouched", async () => {
  const out = await pollFeed(record({ resolution: "feed" }), {
    fetchImpl: async () => new Response(null, { status: 500 }),
  });
  assert.equal(out, null); // unchanged: caller keeps the last-good "feed" record
});

test("poll fetches the pasted feed url, not the bookmark url", async () => {
  let fetched = "";
  const out = await pollFeed(
    record({
      url: "https://site.test/",
      feedUrl: "https://site.test/atom.xml",
      resolution: "pending",
    }),
    {
      fetchImpl: async (url) => {
        fetched = String(url);
        return new Response(rssWith(["a"]), { status: 200 });
      },
    },
  );
  assert.ok(out);
  assert.equal(fetched, "https://site.test/atom.xml");
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

test("a feed failing mid-batch yields no update, so its last-good is never wiped", async () => {
  // Two ESTABLISHED feeds, each already carrying last-good state. One fails this
  // poll (a non-throwing 500, the common case). The failed feed must produce no
  // update at all — so the caller keeps its stored last-good untouched — while the
  // healthy sibling still polls and counts its new item. AC3: one broken feed
  // breaks neither the others nor their last-good state.
  const healthy = record({
    id: "healthy",
    url: "https://healthy.test/feed",
    origin: "https://healthy.test",
    seenGuids: ["h1"],
    items: [{ guid: "h1", title: "Healthy old" }],
    unread: 0,
  });
  const broken = record({
    id: "broken",
    url: "https://broken.test/feed",
    origin: "https://broken.test",
    seenGuids: ["b1"],
    items: [{ guid: "b1", title: "Broken last-good" }],
    unread: 2,
  });
  const updates = await pollAll([broken, healthy], {
    fetchImpl: async (url) =>
      String(url).includes("broken.test")
        ? new Response(null, { status: 500 }) // fails — not a throw
        : new Response(rssWith(["h1", "h2"]), { status: 200 }), // one genuinely new item
  });
  // Broken feed absent from updates → its stored record (last-good) is left as-is.
  assert.deepEqual(
    updates.map((r) => r.id),
    ["healthy"],
  );
  // Healthy sibling unaffected: still counts its new item onto its prior state.
  const healthyUpdate = updates.find((r) => r.id === "healthy");
  assert.ok(healthyUpdate);
  assert.equal(healthyUpdate.unread, 1);
});
