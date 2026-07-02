import browser from "webextension-polyfill";
import type { ParsedItem } from "./parseFeed.ts";

export type FeedResolution = "pending" | "feed" | "no-feed";

export type FeedRecord = {
  id: string;
  title: string;
  url: string; // the bookmark's own URL — the click-through ("open the source")
  feedUrl: string | null; // manually-pasted feed; null → fetch `url` itself
  origin: string; // pinned to the FETCH target's origin (feedUrl's if set, else url's)
  seenGuids: string[];
  unread: number;
  // "pending": registered, not yet conclusively probed. "feed": fetched OK with ≥1
  // item — the first such poll baselines every item as unread (baseline-as-unread,
  // bounded by the parser's MAX_ITEMS cap). "no-feed": fetched OK but 0 items.
  resolution: FeedResolution;
  etag: string | null;
  lastModified: string | null;
  items: ParsedItem[];
};

const KEY = "feeds";

async function readMap(): Promise<Record<string, FeedRecord>> {
  const stored = await browser.storage.local.get(KEY);
  return (stored[KEY] as Record<string, FeedRecord> | undefined) ?? {};
}

export async function loadFeeds(): Promise<FeedRecord[]> {
  return Object.values(await readMap());
}

export async function saveFeed(record: FeedRecord): Promise<void> {
  const map = await readMap();
  map[record.id] = record;
  await browser.storage.local.set({ [KEY]: map });
}

// Replace the whole registry. Unlike saveFeed, feeds absent from `records` are
// dropped — this is how reconcile persists removals after a folder rescan.
export async function saveFeeds(records: FeedRecord[]): Promise<void> {
  const map: Record<string, FeedRecord> = {};
  for (const record of records) map[record.id] = record;
  await browser.storage.local.set({ [KEY]: map });
}

// Zero one feed's unread count (the user opened it). No-op if it's gone. The
// background is the single writer, so this is only ever called there.
export async function clearUnread(id: string): Promise<void> {
  const map = await readMap();
  const record = map[id];
  if (!record) return;
  record.unread = 0;
  await browser.storage.local.set({ [KEY]: map });
}
