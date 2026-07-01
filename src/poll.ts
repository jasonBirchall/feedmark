import { fetchFeed } from "./fetchFeed.ts";
import { parseFeed } from "./parseFeed.ts";
import { fetchTarget } from "./source.ts";
import { discoverFeedUrl } from "./discover.ts";
import { MAX_SEEN_GUIDS, MAX_CONCURRENCY } from "./config.ts";
import type { FeedRecord } from "./storage.ts";
import type { ParsedItem } from "./parseFeed.ts";

// Where autodiscovery narrates its outcome (iter 7). Injectable so the poll logic
// stays unit-testable without capturing global console; defaults to the real
// console in the background. Success is info; every failure-to-resolve is warn.
export type PollLogger = Pick<typeof console, "info" | "warn">;

// First successful feed poll baselines: every current item is tracked in the dedup
// history AND shown as unread (baseline-as-unread, iter 8.5 — THREAT_MODEL.md §4,
// reversing the earlier baseline-all-seen). unread = items.length is itself bounded
// by the parser's MAX_ITEMS cap, so a registration can't inflate past it. Shared by
// the poll loop, subscribe, and autodiscover.
export function baseline(
  record: FeedRecord,
  items: ParsedItem[],
  etag: string | null,
  lastModified: string | null,
): FeedRecord {
  return {
    ...record,
    resolution: "feed",
    seenGuids: items.map((item) => item.guid).slice(0, MAX_SEEN_GUIDS),
    unread: items.length,
    etag,
    lastModified,
    items,
  };
}

export async function pollFeed(
  record: FeedRecord,
  opts: { fetchImpl?: typeof fetch; logger?: PollLogger } = {},
): Promise<FeedRecord | null> {
  const fetchOpts = opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {};
  const logger = opts.logger ?? console;
  const result = await fetchFeed(fetchTarget(record), fetchOpts);
  if (result.kind !== "ok") return null; // notModified / failed → resolution untouched

  const items = parseFeed(result.body);
  if (items.length === 0) {
    // Fetched OK but nothing parseable. An ESTABLISHED feed serving a momentarily
    // bad/empty body is transient → keep its last-good state (never overwrite it);
    // never advance etag — an unparseable body is never last-good.
    if (record.resolution === "feed" || record.resolution === "no-feed") return null;
    // Still pending: the bookmark URL is a page, not a feed. Before settling on
    // no-feed, try same-origin autodiscovery from the page we just fetched (iter 7).
    return autodiscover(record, result.body, fetchOpts, logger);
  }

  // First successful feed poll baselines; an established feed counts new items below.
  if (record.resolution !== "feed") {
    return baseline(record, items, result.etag, result.lastModified);
  }

  const seen = new Set(record.seenGuids);
  const fresh: string[] = [];
  for (const item of items) {
    if (!seen.has(item.guid)) {
      fresh.push(item.guid);
      seen.add(item.guid);
    }
  }

  return {
    ...record,
    unread: record.unread + fresh.length,
    seenGuids: [...fresh, ...record.seenGuids].slice(0, MAX_SEEN_GUIDS),
    etag: result.etag,
    lastModified: result.lastModified,
    items, // latest parse, for the popup to render
  };
}

// Same-origin autodiscovery for a still-pending bookmark whose own URL returned a
// page, not a feed (iter 7). The page HTML is already in hand, so the scan costs no
// request; a discovered same-origin feed costs ONE further fetch, only on this
// one-time pending→feed transition. A cross-origin advertised feed is refused by
// construction (THREAT_MODEL.md §4) and falls back to no-feed + the paste field.
// Every dead-end logs an explicit reason.
async function autodiscover(
  record: FeedRecord,
  html: string,
  fetchOpts: { fetchImpl?: typeof fetch },
  logger: PollLogger,
): Promise<FeedRecord | null> {
  // feedUrl is null while pending, so the page we fetched is record.url.
  const found = discoverFeedUrl(html, record.url);
  if (found.kind === "none") {
    logger.warn(
      found.reason === "cross-origin-only"
        ? `feedmark: ${record.url} advertises only cross-origin feeds — not auto-trusting; paste to subscribe`
        : `feedmark: ${record.url} advertises no feed link`,
    );
    return { ...record, resolution: "no-feed" };
  }

  // A same-origin candidate: fetch + parse it through the SAME fetchFeed/parseFeed
  // as any feed, so the iter-2 bounds and origin-pin ride along by reuse rather than
  // a second copy. The origin is re-pinned to the discovered URL (same host here).
  const origin = new URL(found.url).origin;
  const result = await fetchFeed(
    { url: found.url, origin, etag: null, lastModified: null },
    fetchOpts,
  );
  if (result.kind !== "ok") {
    // The page advertises a same-origin feed but it didn't respond this poll. Treat
    // as transient, like an unreachable homepage: stay pending so the next poll
    // retries, rather than demoting a discoverable feed to no-feed on one blip.
    const reason = result.kind === "failed" ? result.reason : result.kind;
    logger.warn(`feedmark: autodiscovered ${found.url} unreachable (${reason})`);
    return null;
  }

  const items = parseFeed(result.body);
  if (items.length === 0) {
    // Advertised a feed link, but the target isn't a parseable feed → conclusive.
    logger.warn(`feedmark: autodiscovered ${found.url} returned 0 items`);
    return { ...record, resolution: "no-feed" };
  }

  logger.info(`feedmark: autodiscovered feed for ${record.id} → ${found.url}`);
  return baseline(
    { ...record, feedUrl: found.url, origin },
    items,
    result.etag,
    result.lastModified,
  );
}

export async function pollAll(
  records: FeedRecord[],
  opts: { fetchImpl?: typeof fetch; concurrency?: number; logger?: PollLogger } = {},
): Promise<FeedRecord[]> {
  const concurrency = opts.concurrency ?? MAX_CONCURRENCY;
  const pollOpts = {
    ...(opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {}),
    ...(opts.logger ? { logger: opts.logger } : {}),
  };
  const updates: FeedRecord[] = [];
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const idx = next++;
      const rec = records[idx];
      if (!rec) break;
      try {
        const updated = await pollFeed(rec, pollOpts);
        if (updated) updates.push(updated);
      } catch (err) {
        console.debug("feedmark: poll failed", rec.id, err);
      }
    }
  }

  const lanes = Math.max(1, Math.min(concurrency, records.length));
  await Promise.all(Array.from({ length: lanes }, () => worker()));
  return updates;
}
