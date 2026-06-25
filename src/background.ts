// Feedmark background — alarm-driven poll of the feed read from a bookmark.
// All poll state lives in storage.local; nothing is held in memory across wakes.
import browser from "webextension-polyfill";
import { ALARM_NAME, ALARM_PERIOD_MINUTES, SOURCE_BOOKMARK_TITLE } from "./config.ts";
import { loadFeeds, saveFeed, hasFeed } from "./storage.ts";
import { feedFromBookmark } from "./source.ts";
import { pollAll } from "./poll.ts";
import { totalUnread, badgeText } from "./badge.ts";
import type { GetItemsResponse } from "./messages.ts";

// Read the one bookmark titled SOURCE_BOOKMARK_TITLE and register it as the feed
// source. Read once at init (iter 4); live folder sync arrives iter 5. Only the
// FIRST sight writes a record — a re-read never clobbers accumulated state.
async function registerBookmarkSource(): Promise<void> {
  const matches = await browser.bookmarks.search({ title: SOURCE_BOOKMARK_TITLE });
  const bm = matches[0];
  if (!bm) return; // no source bookmark yet → popup shows "No items yet."
  const record = feedFromBookmark(bm);
  if (record && !(await hasFeed(record.id))) {
    await saveFeed(record);
  }
}

async function refreshBadge(): Promise<void> {
  const feeds = await loadFeeds();
  await browser.action.setBadgeText({ text: badgeText(totalUnread(feeds)) });
}

async function pollCycle(): Promise<void> {
  const feeds = await loadFeeds();
  const updates = await pollAll(feeds);
  for (const rec of updates) await saveFeed(rec);
  await refreshBadge();
}

async function init(): Promise<void> {
  await registerBookmarkSource();
  await browser.alarms.create(ALARM_NAME, {
    periodInMinutes: ALARM_PERIOD_MINUTES,
  });
  await pollCycle(); // immediate first poll so the badge populates on load
}

// The popup reads state through here. Read-only: it serves what the alarm poll
// already stored, and never triggers a fetch — so opening the popup makes no
// network request. Returning a Promise replies with its resolved value.
browser.runtime.onMessage.addListener((message: unknown): Promise<GetItemsResponse> | undefined => {
  if ((message as { type?: unknown })?.type === "getItems") {
    return loadFeeds().then((feeds) => ({ items: feeds.flatMap((f) => f.items) }));
  }
  return undefined; // not ours
});

browser.runtime.onInstalled.addListener(() => {
  void init();
});
browser.runtime.onStartup.addListener(() => {
  void init();
});
browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) void pollCycle();
});
