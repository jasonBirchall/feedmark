import type { ParsedItem } from "./parseFeed.ts";
import type { FeedView } from "./messages.ts";

// The load-bearing render invariant (THREAT_MODEL.md §4): feed-derived strings
// reach the DOM via textContent ONLY, never innerHTML. A script/onerror payload
// hidden in a feed title therefore lands as inert text. `doc` is injected so the
// invariant is unit-testable without a real browser (render.test.ts).
export function renderItems(items: ParsedItem[], doc: Document): HTMLElement {
  const list = doc.createElement("ul");
  for (const item of items) {
    const row = doc.createElement("li");
    row.textContent = item.title;
    list.appendChild(row);
  }
  return list;
}

// One labelled section per source: a heading carrying the bookmark title and its
// unread count, then that source's items. The render invariant extends here — the
// bookmark title also reaches the DOM via textContent only, never innerHTML.
export function renderSources(sources: FeedView[], doc: Document): HTMLElement {
  const root = doc.createElement("div");
  for (const source of sources) {
    const section = doc.createElement("section");
    const heading = doc.createElement("h2");
    heading.textContent = `${source.title} (${source.unread})`;
    section.appendChild(heading);
    section.appendChild(renderItems(source.items, doc));
    root.appendChild(section);
  }
  return root;
}
