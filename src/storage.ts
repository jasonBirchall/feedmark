import browser from "webextension-polyfill";
import type { ParsedItem } from "./parseFeed.ts";

export type FeedRecord = {
  id: string;
  url: string;
  origin: string;
  seenGuids: string[];
  unread: number;
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
