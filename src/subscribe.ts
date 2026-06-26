import { fetchFeed } from "./fetchFeed.ts";
import { parseFeed } from "./parseFeed.ts";
import { baseline } from "./poll.ts";
import type { FeedRecord } from "./storage.ts";

export type SubscribeReason = "not-https" | "no-feed" | "unreachable";

export type SubscribeOutcome =
  | { ok: true; record: FeedRecord }
  | { ok: false; reason: SubscribeReason };

// Resolve a pasted feed URL into a subscribed record, or a typed failure. Pure:
// the fetch is injected, so this is the testable home of the iter-6 manual-paste
// gate. The pasted URL is trusted as INTENT; its content flows through the same
// fetchFeed/parseFeed bounds as any feed (5 MB / 30 s / 200 items / origin-pin).
export async function resolveSubscription(
  record: FeedRecord,
  feedUrl: string,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<SubscribeOutcome> {
  let parsed: URL;
  try {
    parsed = new URL(feedUrl);
  } catch {
    return { ok: false, reason: "not-https" }; // not even a URL → refuse
  }
  if (parsed.protocol !== "https:") return { ok: false, reason: "not-https" };

  const result = await fetchFeed(
    { url: feedUrl, origin: parsed.origin, etag: null, lastModified: null },
    opts.fetchImpl ? { fetchImpl: opts.fetchImpl } : {},
  );
  if (result.kind !== "ok") return { ok: false, reason: "unreachable" };

  const items = parseFeed(result.body);
  if (items.length === 0) return { ok: false, reason: "no-feed" }; // not a feed → not persisted

  // Success: pin the feed URL + its origin, baseline its current items as seen.
  const next = baseline(
    { ...record, feedUrl, origin: parsed.origin },
    items,
    result.etag,
    result.lastModified,
  );
  return { ok: true, record: next };
}
