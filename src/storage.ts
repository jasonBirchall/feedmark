import browser from "webextension-polyfill";
import { markAllRead, normalizeRecord } from "./readState.ts";
import type { StoredFeedRecord } from "./readState.ts";
import type { ParsedItem } from "./parseFeed.ts";

export type FeedResolution = "pending" | "feed" | "no-feed";

export type FeedRecord = {
  id: string;
  title: string;
  url: string; // the bookmark's own URL — the click-through ("open the source")
  feedUrl: string | null; // manually-pasted feed; null → fetch `url` itself
  origin: string; // pinned to the FETCH target's origin (feedUrl's if set, else url's)
  seenGuids: string[];
  // Guids the human has read. Unread is DERIVED from items[] minus these (iter
  // B, readState.ts) — there is no stored counter to drift.
  readGuids: string[];
  // "pending": registered, not yet conclusively probed. "feed": fetched OK with ≥1
  // item — after the first such poll every item derives as unread because
  // readGuids is empty (baseline-as-unread, bounded by the parser's MAX_ITEMS
  // cap). "no-feed": fetched OK but 0 items.
  resolution: FeedResolution;
  etag: string | null;
  lastModified: string | null;
  items: ParsedItem[];
};

const KEY = "feeds";

// Every read passes through normalizeRecord, so pre-B/pre-A records (stored
// unread counter, no readGuids, linkless items) upgrade in place on first
// touch and the current shape holds everywhere downstream by construction.
async function readMap(): Promise<Record<string, FeedRecord>> {
  const stored = await browser.storage.local.get(KEY);
  const map = (stored[KEY] as Record<string, StoredFeedRecord> | undefined) ?? {};
  const normalized: Record<string, FeedRecord> = {};
  for (const [id, record] of Object.entries(map)) normalized[id] = normalizeRecord(record);
  return normalized;
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

// Zero one feed's unread count (the user opened it) by marking every stored
// item read — the derived count then falls to zero. No-op if it's gone. The
// background is the single writer, so this is only ever called there.
export async function clearUnread(id: string): Promise<void> {
  const map = await readMap();
  const record = map[id];
  if (!record) return;
  map[id] = markAllRead(record);
  await browser.storage.local.set({ [KEY]: map });
}
