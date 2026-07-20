import { XMLParser } from "fast-xml-parser";
import { MAX_ITEMS } from "./config.ts";

export type ParsedItem = { guid: string; title: string; link: string | null };

// processEntities:false disables custom/DOCTYPE entity expansion, closing the
// billion-laughs vector. fast-xml-parser does not resolve external entities.
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  processEntities: false,
});

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object" && "#text" in value) {
    return textOf((value as Record<string, unknown>)["#text"]);
  }
  return "";
}

function hrefOf(value: unknown): string {
  // Atom <link href="..."/> may be a single object or an array.
  const first = toArray(value)[0];
  if (first && typeof first === "object" && "@_href" in first) {
    return textOf((first as Record<string, unknown>)["@_href"]);
  }
  return textOf(first);
}

// A feed item's link is attacker-controlled text that will later be rendered as
// an href on an extension page. It is admitted only as a parsed `https:` URL, or
// not at all (THREAT_MODEL.md §4) — the same fail-closed shape as the bookmark
// gate in source.ts. The difference: there, fetchFeed re-checks as defence in
// depth; here the renderer deliberately does NOT re-validate, consuming `link`
// as https-or-null by construction. This is therefore the only checkpoint, so it
// has to be total. Rejected by construction: `javascript:`, `data:`, `vbscript:`
// and every other scheme; `http:` (no silent downgrade); protocol-relative
// `//host/x`, which has no scheme to parse and so never survives the URL
// constructor; and anything malformed or absent.
function linkOf(raw: string): string | null {
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null; // malformed, or relative — no base is supplied, deliberately
  }
  // The canonical serialisation of what was actually validated, not the raw text.
  return parsed.protocol === "https:" ? parsed.href : null;
}

// Identity chain, most-to-least stable. The title fallback keeps an item that
// carries neither guid nor link from being silently dropped (THREAT_MODEL.md §4 /
// iter-8 AC1: "don't lose items"). It's a deliberate trade: the title is stable
// across polls, so the same item keeps the same identity and is never re-counted;
// two genuinely-different items sharing a title collapse to one — an under-count,
// the safe direction, never the badge inflation the AC actually guards against.
function rssGuid(item: Record<string, unknown>): string {
  return textOf(item["guid"]) || textOf(item["link"]) || textOf(item["title"]);
}

function atomGuid(entry: Record<string, unknown>): string {
  return textOf(entry["id"]) || hrefOf(entry["link"]) || textOf(entry["title"]);
}

// The article's own URL, gated. Kept separate from the identity chain above:
// `guid` wants *any* stable string, `link` wants a URL safe to navigate to, so a
// rejected link must never disturb the guid an item is already known by.
function rssLink(item: Record<string, unknown>): string | null {
  return linkOf(textOf(item["link"]));
}

function atomLink(entry: Record<string, unknown>): string | null {
  return linkOf(alternateHrefOf(entry["link"]));
}

// Atom entries carry several <link>s distinguished by rel. Only rel="alternate"
// — or an absent rel, which RFC 4287 defines as alternate — is the article; a
// "self", "edit", "replies" or "enclosure" href is feed plumbing and not
// somewhere to send a reader. hrefOf's take-the-first rule is right for identity
// (any stable href will do) and wrong here, which is why the two stay separate.
// A <link> with no href attribute yields nothing: no href, no link.
function alternateHrefOf(value: unknown): string {
  for (const node of toArray(value)) {
    if (!node || typeof node !== "object") continue;
    const record = node as Record<string, unknown>;
    if (!("@_href" in record)) continue;
    const rel = textOf(record["@_rel"]);
    if (rel === "" || rel === "alternate") return textOf(record["@_href"]);
  }
  return "";
}

export function parseFeed(xml: string): ParsedItem[] {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }

  const rss = doc["rss"] as Record<string, unknown> | undefined;
  const channel = rss?.["channel"] as Record<string, unknown> | undefined;
  const feed = doc["feed"] as Record<string, unknown> | undefined;

  const raw = channel ? toArray(channel["item"]) : toArray(feed?.["entry"]);
  const pickGuid = channel ? rssGuid : atomGuid;
  const pickLink = channel ? rssLink : atomLink;

  const items: ParsedItem[] = [];
  for (const node of raw) {
    if (items.length >= MAX_ITEMS) break;
    if (!node || typeof node !== "object") continue;
    const record = node as Record<string, unknown>;
    const guid = pickGuid(record);
    // A rejected link never costs us the item — only its link (AC A2).
    if (guid) items.push({ guid, title: textOf(record["title"]), link: pickLink(record) });
  }
  return items;
}
