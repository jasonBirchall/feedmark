import type { ParsedItem } from "./parseFeed.ts";

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
