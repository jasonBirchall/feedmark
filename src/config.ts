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
export const MAX_CONCURRENCY = 3; // concurrent feed fetches

// The single source for iteration 4: the extension reads the first bookmark
// titled this and treats its URL as the feed. Folder mirroring arrives in iter 5.
export const SOURCE_BOOKMARK_TITLE = "Feedmark";
