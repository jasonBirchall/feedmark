// Central constants. Security parameters (bounds) and the throwaway iter-2 feed
// live here so every module references one source. No logic.

export const ALARM_NAME = "feedmark-poll";
export const ALARM_PERIOD_MINUTES = 15;

// Resource bounds (THREAT_MODEL.md §4). These are security parameters.
export const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MB
export const FETCH_TIMEOUT_MS = 30_000; // 30 s
export const MAX_ITEMS = 200; // items parsed per feed
export const MAX_SEEN_GUIDS = 200; // bounded seen-GUID history per feed
export const MAX_CONCURRENCY = 3; // concurrent feed fetches

// Throwaway hardcoded feed for the walking skeleton; replaced by a bookmark in
// iteration 4. Origin is pinned here at "registration".
export const HARDCODED_FEEDS: ReadonlyArray<{
  id: string;
  url: string;
  origin: string;
}> = [
  {
    id: "mozilla-blog",
    url: "https://blog.mozilla.org/feed/",
    origin: "https://blog.mozilla.org",
  },
];
