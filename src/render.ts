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

// One labelled section per source: a clickable heading linking to the source's
// site and carrying its title + unread count, then that source's items. Clicking
// opens the site (the href) and calls onOpen so the caller can clear the count.
// The render invariant extends here — the bookmark title reaches the DOM via
// textContent only, never innerHTML; the href is the registration-validated
// https url.
export function renderSources(
  sources: FeedView[],
  doc: Document,
  onOpen: (id: string) => void,
): HTMLElement {
  const root = doc.createElement("div");
  for (const source of sources) {
    const section = doc.createElement("section");
    const heading = doc.createElement("a");
    heading.href = source.url;
    heading.textContent = `${source.title} (${source.unread})`;
    heading.addEventListener("click", () => onOpen(source.id));
    section.appendChild(heading);
    section.appendChild(renderItems(source.items, doc));
    root.appendChild(section);
  }
  return root;
}
