// Same-origin feed autodiscovery. Given the HTML a bookmark returned and
// the URL it was fetched from, find a feed the page ADVERTISES via a <link> tag —
// but only trust it if it is same-origin. A cross-origin advertised feed is never
// auto-trusted (THREAT_MODEL.md §4: reject cross-origin autodiscovery); it falls
// back to the manual-paste path, where a cross-origin subscribe is an explicit,
// attributable human act rather than machine inference over attacker-influenced HTML.
//
// Pure and browser-free (no DOM): a narrow string scan, so this is plain unit-test
// territory and stays off the HTML-parser attack surface. The body is already
// bounded to 5 MB by fetchFeed before it reaches here.

export type DiscoverReason =
  | "no-feed-link" // the page advertises no rss/atom <link> at all
  | "cross-origin-only"; // feed link(s) found, but every one is off-origin — the gate firing

export type DiscoverResult =
  | { kind: "found"; url: string }
  | { kind: "none"; reason: DiscoverReason };

// The feed MIME types our XML parser can actually read. JSON Feed is excluded by
// construction — it would never parse, so advertising it is not a usable feed here.
const FEED_TYPES = new Set(["application/rss+xml", "application/atom+xml"]);

// Linear, ReDoS-safe patterns. `[^>]*` / `[^...]*` have no nested quantifiers, so
// matching stays O(n) over an attacker-supplied body.
const LINK_TAG = /<link\b[^>]*>/gi;
const ATTR = (name: string) => new RegExp(`\\b${name}\\s*=\\s*("[^"]*"|'[^']*'|[^\\s">]+)`, "i");

function attr(tag: string, name: string): string | null {
  const raw = tag.match(ATTR(name))?.[1];
  if (raw == null) return null;
  // Strip matching surrounding quotes, if any.
  return raw.startsWith('"') || raw.startsWith("'") ? raw.slice(1, -1) : raw;
}

function isFeedType(type: string | null): boolean {
  if (!type) return false;
  // Tolerate a charset suffix, e.g. type="application/rss+xml; charset=utf-8".
  const mime = (type.split(";")[0] ?? "").trim().toLowerCase();
  return FEED_TYPES.has(mime);
}

export function discoverFeedUrl(html: string, pageUrl: string): DiscoverResult {
  let pageOrigin: string;
  try {
    pageOrigin = new URL(pageUrl).origin;
  } catch {
    return { kind: "none", reason: "no-feed-link" }; // no base to resolve against
  }

  let sawFeedLink = false;
  for (const [tag] of html.matchAll(LINK_TAG)) {
    if (!isFeedType(attr(tag, "type"))) continue;
    const href = attr(tag, "href");
    if (!href) continue;
    sawFeedLink = true; // the page advertises a feed, whether or not we can trust it

    let resolved: URL;
    try {
      resolved = new URL(href, pageUrl); // relative hrefs resolve to the page origin
    } catch {
      continue; // malformed href → unusable, keep scanning
    }
    // The gate: accept only a same-origin feed. A same-host http:// link differs in
    // scheme → different origin → rejected, so https-only rides along for free. A
    // hostile <base href> can't help: we resolve against the real page URL.
    if (resolved.origin === pageOrigin) return { kind: "found", url: resolved.href };
  }

  return sawFeedLink
    ? { kind: "none", reason: "cross-origin-only" }
    : { kind: "none", reason: "no-feed-link" };
}
