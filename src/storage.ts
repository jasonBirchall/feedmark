import browser from "webextension-polyfill";
import type { ParsedItem } from "./parseFeed.ts";

export type FeedRecord = {
  id: string;
  title: string;
  url: string;
  origin: string;
  seenGuids: string[];
  unread: number;
  // False until the first successful poll, which baselines every current item as
  // seen with unread 0 (THREAT_MODEL.md §4: no badge inflation on registration).
  baselined: boolean;
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

export async function hasFeed(id: string): Promise<boolean> {
  const map = await readMap();
  return id in map;
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
