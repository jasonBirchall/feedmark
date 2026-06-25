// Feedmark background — iteration 2: alarm-driven poll of the hardcoded feed.
// All poll state lives in storage.local; nothing is held in memory across wakes.
import browser from "webextension-polyfill";
import { ALARM_NAME, ALARM_PERIOD_MINUTES } from "./config.ts";
import { ensureSeedFeeds, loadFeeds, saveFeed } from "./storage.ts";
import { pollAll } from "./poll.ts";
import { totalUnread, badgeText } from "./badge.ts";
import type { GetItemsResponse } from "./messages.ts";

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
  await ensureSeedFeeds();
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
