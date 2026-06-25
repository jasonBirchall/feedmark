// Feedmark background — alarm-driven poll of a bookmark folder, kept in live sync.
// All poll state lives in storage.local; nothing is held in memory across wakes.
import browser from "webextension-polyfill";
import { ALARM_NAME, ALARM_PERIOD_MINUTES, SOURCE_FOLDER_TITLE } from "./config.ts";
import { loadFeeds, saveFeed, saveFeeds, clearUnread } from "./storage.ts";
import { feedsFromFolder, reconcile } from "./source.ts";
import { pollAll } from "./poll.ts";
import { totalUnread, badgeText } from "./badge.ts";
import type { FeedRecord } from "./storage.ts";
import type { GetItemsResponse } from "./messages.ts";

// Scan the folder titled SOURCE_FOLDER_TITLE into fresh feed records — empty if
// there's no such folder yet (popup then shows "No items yet.").
async function scanFolder(): Promise<FeedRecord[]> {
  const matches = await browser.bookmarks.search({ title: SOURCE_FOLDER_TITLE });
  const folder = matches.find((node) => !node.url); // a folder has no url
  if (!folder) return [];
  const [tree] = await browser.bookmarks.getSubTree(folder.id);
  return tree ? feedsFromFolder(tree) : [];
}

// Bring the registry in line with the folder, then poll. Runs at init and on every
// bookmark event, so add/rename/move/remove reflect without a reload. reconcile
// preserves accumulated state and drops vanished feeds; the background stays the
// single writer.
async function resyncFolder(): Promise<void> {
  const current = await loadFeeds();
  await saveFeeds(reconcile(current, await scanFolder()));
  await pollCycle();
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
  await browser.alarms.create(ALARM_NAME, {
    periodInMinutes: ALARM_PERIOD_MINUTES,
  });
  await resyncFolder(); // scan + reconcile + first poll; badge populates on load
}

// The popup reads state through here. Read-only: it serves what the alarm poll
// already stored, and never triggers a fetch — so opening the popup makes no
// network request. Returning a Promise replies with its resolved value.
browser.runtime.onMessage.addListener((message: unknown): Promise<GetItemsResponse> | undefined => {
  const msg = message as { type?: unknown; id?: unknown };
  if (msg?.type === "getItems") {
    return loadFeeds().then((feeds) => ({
      sources: feeds.map((f) => ({
        id: f.id,
        url: f.url,
        title: f.title,
        unread: f.unread,
        items: f.items,
      })),
    }));
  }
  // Opening a source clears its count; recompute the badge from the new state.
  if (msg?.type === "clearUnread" && typeof msg.id === "string") {
    void clearUnread(msg.id).then(refreshBadge);
  }
  return undefined; // not ours, or fire-and-forget with no reply
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

// Live folder sync: any add/rename/move/remove triggers a full rescan + reconcile.
// Coarse by design — an unrelated bookmark edit just reconciles to a no-op — which
// keeps the registry drift-free without per-event folder-membership bookkeeping.
browser.bookmarks.onCreated.addListener(() => void resyncFolder());
browser.bookmarks.onChanged.addListener(() => void resyncFolder());
browser.bookmarks.onRemoved.addListener(() => void resyncFolder());
browser.bookmarks.onMoved.addListener(() => void resyncFolder());
