import { test } from "node:test";
import assert from "node:assert/strict";
import { pollFeed, pollAll, type PollLogger } from "./poll.ts";
import { unreadCount, markItemRead } from "./readState.ts";
import { MAX_ITEMS, MAX_SEEN_GUIDS } from "./config.ts";
import type { FeedRecord } from "./storage.ts";
import type { ParsedItem } from "./parseFeed.ts";

// Stored items default to linkless: poll's concern is identity and counting, and
// the link gate has its own tests in parseFeed.test.ts.
function item(over: Partial<ParsedItem> = {}): ParsedItem {
  return { guid: "g", title: "T", link: null, ...over };
}

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
    readGuids: [],
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

test("first poll shows current items as unread (baseline-as-unread)", async () => {
  const out = await pollFeed(record({ resolution: "pending" }), {
    fetchImpl: okFetch(rssWith(["a", "b", "c"])),
  });
  assert.ok(out);
  assert.equal(unreadCount(out), 3); // its current items derive as unread on first resolve
  assert.deepEqual(out.readGuids, []); // ...BECAUSE nothing is read yet — derived, not asserted
  assert.deepEqual(out.seenGuids, ["a", "b", "c"]); // all tracked in the dedup history
  assert.equal(out.resolution, "feed"); // and won't baseline again
});

test("a feed with more than MAX_ITEMS shows at most MAX_ITEMS unread (bounded)", async () => {
  // AC4: one registration can't inflate past the cap. Unread derives from the
  // parser-capped items[], so it can never exceed MAX_ITEMS — a hostile feed
  // gets a bounded, annoying number, never "thousands".
  const guids = Array.from({ length: MAX_ITEMS + 50 }, (_, n) => `g${n}`);
  const out = await pollFeed(record({ resolution: "pending" }), {
    fetchImpl: okFetch(rssWith(guids)),
  });
  assert.ok(out);
  assert.equal(unreadCount(out), MAX_ITEMS);
});

test("after a source is cleared, only a genuinely new item counts (not the backlog)", async () => {
  // AC3: baseline shows all current items as unread...
  const baselined = await pollFeed(record({ resolution: "pending" }), {
    fetchImpl: okFetch(rssWith(["a", "b", "c"])),
  });
  assert.ok(baselined);
  assert.equal(unreadCount(baselined), 3);
  // ...the user reads every current item, one click at a time (iter D's model).
  const cleared = ["a", "b", "c"].reduce(markItemRead, baselined);
  assert.equal(unreadCount(cleared), 0);
  // A later poll with one genuinely new item derives 1 — a/b/c stay read even re-served.
  const out = await pollFeed(cleared, {
    fetchImpl: okFetch(rssWith(["d", "a", "b", "c"])),
  });
  assert.ok(out);
  assert.equal(unreadCount(out), 1);
});

test("items appearing after a cleared baseline count as unread", async () => {
  // baselined on ["a", "b"] and read; only "c" is genuinely new — it alone derives unread
  const out = await pollFeed(
    record({ seenGuids: ["a", "b"], readGuids: ["a", "b"], resolution: "feed" }),
    { fetchImpl: okFetch(rssWith(["c", "a", "b"])) },
  );
  assert.ok(out);
  assert.equal(unreadCount(out), 1);
  assert.equal(out.seenGuids[0], "c");
});

test("re-polling the same items adds nothing", async () => {
  const out = await pollFeed(
    record({ seenGuids: ["a", "b"], items: [item({ guid: "a" }), item({ guid: "b" })] }),
    { fetchImpl: okFetch(rssWith(["a", "b"])) },
  );
  assert.ok(out);
  assert.equal(unreadCount(out), 2); // both still unread, still exactly two
});

test("new items accumulate onto the prior unread", async () => {
  const out = await pollFeed(record({ seenGuids: ["a"], items: [item({ guid: "a" })] }), {
    fetchImpl: okFetch(rssWith(["b", "c", "a"])),
  });
  assert.ok(out);
  assert.equal(unreadCount(out), 3); // the unread "a" plus two new items
  assert.deepEqual(out.seenGuids.slice(0, 2), ["b", "c"]);
});

test("reading state survives polls: a re-served, reordered read item stays read (B2)", async () => {
  // "a" was read. The feed re-serves it — reordered, after a restart-shaped
  // reload of the record from storage — and it must never re-count.
  const out = await pollFeed(
    record({
      seenGuids: ["a", "b"],
      readGuids: ["a"],
      items: [item({ guid: "a" }), item({ guid: "b" })],
    }),
    { fetchImpl: okFetch(rssWith(["b", "a"])) }, // reordered re-serve
  );
  assert.ok(out);
  assert.equal(unreadCount(out), 1); // only "b" — "a" is read, wherever it appears
  assert.ok(out.readGuids.includes("a")); // read history untouched by the poll
});

test("an item evicted from items[] stops contributing to the derived count", async () => {
  // The deliberate iter-B semantic: "a" was never read, but a burst of MAX_ITEMS
  // newer items pushes it past the parser cap — still in the feed's XML, no
  // longer stored, so it simply no longer counts. Unread derives from what IS
  // stored, not from everything ever unread.
  const guids = Array.from({ length: MAX_ITEMS }, (_, n) => `n${n}`);
  const out = await pollFeed(
    record({ seenGuids: ["a"], items: [item({ guid: "a" })] }),
    { fetchImpl: okFetch(rssWith([...guids, "a"])) }, // "a" served last, past the cap
  );
  assert.ok(out);
  assert.equal(out.items.length, MAX_ITEMS);
  assert.ok(!out.items.some((i) => i.guid === "a")); // evicted by the cap
  assert.equal(unreadCount(out), MAX_ITEMS); // not MAX_ITEMS + 1: "a" is gone, so uncounted
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
    item({ guid: "a", title: "Alpha" }),
    item({ guid: "b", title: "Beta" }),
  ]);
});

test("each poll replaces the stored items with the latest parse", async () => {
  const out = await pollFeed(
    record({ items: [item({ guid: "old", title: "Old" })], seenGuids: ["old"] }),
    { fetchImpl: okFetch(rssWithTitles([{ guid: "new", title: "New" }])) },
  );
  assert.ok(out);
  assert.deepEqual(out.items, [item({ guid: "new", title: "New" })]);
});

test("a failed fetch leaves state untouched (null, last-good preserved)", async () => {
  const out = await pollFeed(record({ seenGuids: ["a"], items: [item({ guid: "a" })] }), {
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

test("a title-identified item shows as unread and is not re-counted next poll", async () => {
  // A feed whose items have only titles. The title is the synthesised identity;
  // because it's stable across polls, the item is seen once and never re-counted.
  const baselined = await pollFeed(record({ resolution: "pending" }), {
    fetchImpl: okFetch(rssTitleOnly(["Daily News"])),
  });
  assert.ok(baselined);
  assert.equal(unreadCount(baselined), 1); // shown as unread, identified by title
  assert.deepEqual(baselined.seenGuids, ["Daily News"]); // kept, identified by title

  const repoll = await pollFeed(baselined, {
    fetchImpl: okFetch(rssTitleOnly(["Daily News"])),
  });
  assert.ok(repoll);
  assert.equal(unreadCount(repoll), 1); // same title → same identity → not re-counted (stays 1)
});

test("a feed reusing one guid across two items counts it once (no inflation)", async () => {
  // A buggy/hostile feed hands two distinct items the same guid. Dedup collapses
  // them to a single new item — an under-count, never the badge inflation AC1 guards.
  const out = await pollFeed(record({ seenGuids: ["old"] }), {
    fetchImpl: okFetch(rssWith(["dup", "dup"])),
  });
  assert.ok(out);
  assert.equal(unreadCount(out), 1); // one new identity, not two
});

test("seenGuids is bounded to MAX_SEEN_GUIDS", async () => {
  const guids = Array.from({ length: 250 }, (_, n) => `g${n}`);
  const out = await pollFeed(record(), { fetchImpl: okFetch(rssWith(guids)) });
  assert.ok(out);
  assert.equal(out.seenGuids.length, 200);
});

test("the stored record stays bounded — storage does not grow forever (retention)", async () => {
  // A feed serving far more than the caps. Everything the poll persists into
  // storage.local is bounded: the rendered items by MAX_ITEMS, the seen-GUID
  // history by MAX_SEEN_GUIDS. So no single feed can grow a record without limit.
  // (iter-8 AC2, the count-bound reading of retention — no time-based age-out.)
  const guids = Array.from({ length: MAX_ITEMS + MAX_SEEN_GUIDS + 50 }, (_, n) => `g${n}`);
  const out = await pollFeed(record({ resolution: "pending" }), {
    fetchImpl: okFetch(rssWith(guids)),
  });
  assert.ok(out);
  assert.equal(out.items.length, MAX_ITEMS); // the parse persisted to render is capped
  assert.equal(out.seenGuids.length, MAX_SEEN_GUIDS); // the seen history is capped
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
  assert.equal(unreadCount(out), 2); // its two items derive as unread
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
    readGuids: ["h1"], // its one old item is read; only the new one should derive
    items: [item({ guid: "h1", title: "Healthy old" })],
  });
  const broken = record({
    id: "broken",
    url: "https://broken.test/feed",
    origin: "https://broken.test",
    seenGuids: ["b1"],
    items: [item({ guid: "b1", title: "Broken last-good" })],
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
  assert.equal(unreadCount(healthyUpdate), 1);
});
