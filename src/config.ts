// Central constants. Security parameters (bounds), the alarm schedule, and the
// marker title of the source bookmark live here so every module references one
// source. No logic.

export const ALARM_NAME = "feedmark-poll";
export const ALARM_PERIOD_MINUTES = 15;

// Resource bounds (THREAT_MODEL.md §4). These are security parameters.
export const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB
export const FETCH_TIMEOUT_MS = 30_000; // 30 s
export const MAX_ITEMS = 200; // items parsed per feed
export const MAX_SEEN_GUIDS = 200; // bounded seen-GUID history per feed
export const MAX_READ_GUIDS = 200; // bounded read-GUID history per feed (iter B; mirrors MAX_SEEN_GUIDS)
export const MAX_CONCURRENCY = 3; // concurrent feed fetches

// The watched folder (iter 5): the extension mirrors the bookmarks folder titled
// this — each child bookmark becomes a feed source.
export const SOURCE_FOLDER_TITLE = "Feedmark";

// Popup display bound (iter 8.75): item titles shown per source. Display-only —
// storage still holds up to MAX_ITEMS per feed; nothing is dropped, just not listed.
export const MAX_POPUP_ITEMS = 10;
