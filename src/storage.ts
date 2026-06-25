import browser from "webextension-polyfill";
import { HARDCODED_FEEDS } from "./config.ts";

export type FeedRecord = {
  id: string;
  url: string;
  origin: string;
  seenGuids: string[];
  unread: number;
  etag: string | null;
  lastModified: string | null;
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

export async function ensureSeedFeeds(): Promise<void> {
  const map = await readMap();
  let changed = false;
  for (const feed of HARDCODED_FEEDS) {
    if (!map[feed.id]) {
      map[feed.id] = {
        ...feed,
        seenGuids: [],
        unread: 0,
        etag: null,
        lastModified: null,
      };
      changed = true;
    }
  }
  if (changed) await browser.storage.local.set({ [KEY]: map });
}
