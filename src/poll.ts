import { fetchFeed } from "./fetchFeed.ts";
import { parseFeed } from "./parseFeed.ts";
import { MAX_SEEN_GUIDS, MAX_CONCURRENCY } from "./config.ts";
import type { FeedRecord } from "./storage.ts";

export async function pollFeed(
  record: FeedRecord,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<FeedRecord | null> {
  const fetchOpts = opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {};
  const result = await fetchFeed(record, fetchOpts);
  if (result.kind !== "ok") return null; // notModified / failed → untouched

  const items = parseFeed(result.body);
  if (items.length === 0) return null; // malformed / empty → do not advance etag

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
