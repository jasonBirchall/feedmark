import { XMLParser } from "fast-xml-parser";
import { MAX_ITEMS } from "./config.ts";

export type ParsedItem = { guid: string };

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

function rssGuid(item: Record<string, unknown>): string {
  return textOf(item["guid"]) || textOf(item["link"]);
}

function atomGuid(entry: Record<string, unknown>): string {
  return textOf(entry["id"]) || hrefOf(entry["link"]);
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

  const items: ParsedItem[] = [];
  for (const node of raw) {
    if (items.length >= MAX_ITEMS) break;
    if (!node || typeof node !== "object") continue;
    const guid = pickGuid(node as Record<string, unknown>);
    if (guid) items.push({ guid });
  }
  return items;
}
