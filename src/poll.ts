import { fetchFeed } from "./fetchFeed.ts";
import { parseFeed } from "./parseFeed.ts";
import { fetchTarget } from "./source.ts";
import { MAX_SEEN_GUIDS, MAX_CONCURRENCY } from "./config.ts";
import type { FeedRecord } from "./storage.ts";
import type { ParsedItem } from "./parseFeed.ts";

// First successful feed poll baselines every current item as seen (unread untouched,
// 0 at registration — no badge inflation). Shared by the poll loop and subscribe.
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
    etag,
    lastModified,
    items,
  };
}

export async function pollFeed(
  record: FeedRecord,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<FeedRecord | null> {
  const fetchOpts = opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {};
  const result = await fetchFeed(fetchTarget(record), fetchOpts);
  if (result.kind !== "ok") return null; // notModified / failed → resolution untouched

  const items = parseFeed(result.body);
  if (items.length === 0) {
    // Fetched OK but nothing parseable. An ESTABLISHED feed serving a momentarily
    // bad/empty body is transient → keep its last-good state (never overwrite it).
    // Only a not-yet-established source becomes "no-feed" so the popup offers the
    // paste field; do NOT advance etag — an unparseable body is never last-good.
    if (record.resolution === "feed" || record.resolution === "no-feed") return null;
    return { ...record, resolution: "no-feed" };
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

export async function pollAll(
  records: FeedRecord[],
  opts: { fetchImpl?: typeof fetch; concurrency?: number } = {},
): Promise<FeedRecord[]> {
  const concurrency = opts.concurrency ?? MAX_CONCURRENCY;
  const updates: FeedRecord[] = [];
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const idx = next++;
      const rec = records[idx];
      if (!rec) break;
      try {
        const updated = await pollFeed(rec, opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {});
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
