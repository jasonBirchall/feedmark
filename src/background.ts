// Feedmark background — alarm-driven poll of a bookmark folder, kept in live sync.
// All poll state lives in storage.local; nothing is held in memory across wakes.
import browser from "webextension-polyfill";
import { ALARM_NAME, ALARM_PERIOD_MINUTES, SOURCE_FOLDER_TITLE } from "./config.ts";
import {
  loadFeeds,
  saveFeed,
  saveFeeds,
  markItemRead,
  markSourceRead,
  loadSettings,
  saveSettings,
} from "./storage.ts";
import { feedsFromFolder, nextRegistry } from "./source.ts";
import { listFolders } from "./folders.ts";
import { pollAll } from "./poll.ts";
import { resolveSubscription } from "./subscribe.ts";
import { totalUnread, badgeText } from "./badge.ts";
import { unreadCount, unreadItems } from "./readState.ts";
import type { FolderScan } from "./source.ts";
import type {
  FolderStatus,
  GetFoldersResponse,
  GetItemsResponse,
  SetFolderResponse,
  SubscribeResponse,
} from "./messages.ts";

// The watched folder's id (iter E). With no settings stored at all, the
// one-time migration adopts the folder titled SOURCE_FOLDER_TITLE and
// persists its id — an existing install keeps working untouched; a fresh
// install with no such folder persists null and the popup prompts for the
// options page. After that the title never matters again: the folder is
// tracked by identity, so renames change nothing and a same-named second
// folder is never picked up.
async function resolveFolderId(): Promise<string | null> {
  const settings = await loadSettings();
  if (settings) return settings.folderId;
  const matches = await browser.bookmarks.search({ title: SOURCE_FOLDER_TITLE });
  const folderId = matches.find((node) => !node.url)?.id ?? null; // a folder has no url
  await saveSettings({ folderId });
  return folderId;
}

// Scan the chosen folder into fresh feed records. getSubTree REJECTS on an
// unknown id — which is what tells a deleted folder ("missing": registry kept,
// fail safe) apart from an empty one ("ok" with no feeds: records drop).
async function scanFolder(): Promise<FolderScan> {
  const folderId = await resolveFolderId();
  if (folderId === null) return { status: "none" };
  try {
    const [tree] = await browser.bookmarks.getSubTree(folderId);
    return { status: "ok", feeds: tree ? feedsFromFolder(tree) : [] };
  } catch {
    return { status: "missing" };
  }
}

// Bring the registry in line with the folder. nextRegistry applies the iter-E
// fail-safe: only an OK scan may change the registry — a missing or unchosen
// folder destroys nothing.
async function syncFolder(): Promise<void> {
  const scan = await scanFolder();
  await saveFeeds(nextRegistry(await loadFeeds(), scan));
}

// Sync then poll. Runs at init and on every bookmark event, so
// add/rename/move/remove reflect without a reload. reconcile preserves
// accumulated state and drops vanished feeds; the background stays the single
// writer.
async function resyncFolder(): Promise<void> {
  await syncFolder();
  await pollCycle();
}

// What the popup's empty state needs to know (iter E). A local bookmarks
// lookup only — opening the popup still makes no network request.
async function folderStatus(): Promise<FolderStatus> {
  const folderId = await resolveFolderId();
  if (folderId === null) return "none";
  try {
    await browser.bookmarks.get(folderId);
    return "ok";
  } catch {
    return "missing";
  }
}

// Choose the watched folder (iter E): validate the id still resolves, persist
// the setting, sync the registry, and only then reply — so the options page's
// "Saved." means the choice took. The poll runs on asynchronously and the
// badge follows (customer decision: reply after persist + scan, not the full
// poll). Validation first: persisting a dead id would wrongly flip the popup
// into the folder-gone state.
async function handleSetFolder(id: string): Promise<SetFolderResponse> {
  try {
    await browser.bookmarks.getSubTree(id);
  } catch {
    return { ok: false }; // deleted since it was listed; nothing changed
  }
  await saveSettings({ folderId: id });
  await syncFolder();
  void pollCycle();
  return { ok: true };
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

// Subscribe a source to a pasted feed URL. The fetch + validation live in the pure
// resolveSubscription; here we just load the record, persist a success, and refresh
// the badge. Returns a typed reply the popup renders.
async function handleSubscribe(id: string, feedUrl: string): Promise<SubscribeResponse> {
  const record = (await loadFeeds()).find((f) => f.id === id);
  if (!record) return { ok: false, reason: "unreachable" }; // bookmark vanished meanwhile
  const outcome = await resolveSubscription(record, feedUrl);
  if (!outcome.ok) return { ok: false, reason: outcome.reason };
  await saveFeed(outcome.record);
  await refreshBadge();
  const r = outcome.record;
  return {
    ok: true,
    source: {
      id: r.id,
      title: r.title,
      unread: unreadCount(r),
      items: unreadItems(r),
      state: "feed",
    },
  };
}

async function init(): Promise<void> {
  await browser.alarms.create(ALARM_NAME, {
    periodInMinutes: ALARM_PERIOD_MINUTES,
  });
  // Badge in the accent colour — matches the icon and --accent in popup.css.
  await browser.action.setBadgeBackgroundColor({ color: "#e8590c" });
  await resyncFolder(); // scan + reconcile + first poll; badge populates on load
}

// The popup reads state through here. Read-only: it serves what the alarm poll
// already stored, and never triggers a fetch — so opening the popup makes no
// network request. Returning a Promise replies with its resolved value.
browser.runtime.onMessage.addListener(
  (
    message: unknown,
  ):
    | Promise<GetItemsResponse | GetFoldersResponse | SetFolderResponse | SubscribeResponse>
    | undefined => {
    const msg = message as { type?: unknown; id?: unknown; feedUrl?: unknown; guid?: unknown };
    if (msg?.type === "getItems") {
      return Promise.all([folderStatus(), loadFeeds()]).then(([folder, feeds]) => ({
        // The folder state rides along (iter E) so the popup can tell "no
        // folder chosen" and "folder deleted" apart from "folder empty".
        folder,
        sources: feeds.map((f) => ({
          id: f.id,
          title: f.title,
          // Pill and list both derive through readState's one shared predicate
          // (iter C): items carries only the UNREAD items, so the popup renders
          // what it gets and never re-filters — a duplicate-guid feed can't
          // show rows the pill doesn't count.
          unread: unreadCount(f),
          items: unreadItems(f),
          state: f.resolution,
        })),
      }));
    }
    // The options page's picker data (iter E): the full folder list plus the
    // current choice. Read-only, like getItems.
    if (msg?.type === "getFolders") {
      return Promise.all([browser.bookmarks.getTree(), resolveFolderId()]).then(
        ([roots, currentId]) => ({ folders: listFolders(roots), currentId }),
      );
    }
    // Choose the watched folder (iter E): request/response, replied after
    // persist + sync; the poll continues asynchronously.
    if (msg?.type === "setFolder" && typeof msg.id === "string") {
      return handleSetFolder(msg.id);
    }
    // Subscribe a no-feed source to a pasted feed URL; reply with the resolved source.
    if (
      msg?.type === "subscribe" &&
      typeof msg.id === "string" &&
      typeof msg.feedUrl === "string"
    ) {
      return handleSubscribe(msg.id, msg.feedUrl);
    }
    // Reading an item (iter D): persist the read guid, recompute the badge from
    // the new derived state. Fire-and-forget — no reply, see messages.ts.
    if (
      msg?.type === "markItemRead" &&
      typeof msg.id === "string" &&
      typeof msg.guid === "string"
    ) {
      void markItemRead(msg.id, msg.guid).then(refreshBadge);
    }
    // The wholesale per-source read (iter D.1): same persistence + badge path.
    if (msg?.type === "markSourceRead" && typeof msg.id === "string") {
      void markSourceRead(msg.id).then(refreshBadge);
    }
    return undefined; // not ours, or fire-and-forget with no reply
  },
);

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
