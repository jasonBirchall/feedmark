import type { ParsedItem } from "./parseFeed.ts";
import type { FeedView, SubscribeResponse } from "./messages.ts";

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
  handlers: {
    onOpen: (id: string) => void;
    onSubscribe: (id: string, feedUrl: string) => Promise<SubscribeResponse>;
  },
): HTMLElement {
  const root = doc.createElement("div");
  for (const source of sources) {
    const section = doc.createElement("section");
    const heading = doc.createElement("a");
    heading.href = source.url; // the bookmark site — always the click-through
    // A resolved feed shows its unread count; a no-feed source is just its title.
    heading.textContent =
      source.state === "feed" ? `${source.title} (${source.unread})` : source.title;
    heading.addEventListener("click", () => handlers.onOpen(source.id));
    section.appendChild(heading);
    if (source.state === "feed") {
      section.appendChild(renderItems(source.items, doc));
    } else {
      section.appendChild(renderNoFeed(source, doc, handlers.onSubscribe));
    }
    root.appendChild(section);
  }
  return root;
}

// The "no feed here" state: a clear label and a paste field. On Subscribe the button
// disables and a status line shows "Checking…"; the background does the fetch. On
// failure the typed reason becomes an inline message and the button re-enables; on
// success the popup re-renders this source as a feed (handled by onSubscribe).
function renderNoFeed(
  source: FeedView,
  doc: Document,
  onSubscribe: (id: string, feedUrl: string) => Promise<SubscribeResponse>,
): HTMLElement {
  const block = doc.createElement("div");

  const label = doc.createElement("p");
  label.textContent = "No feed found here.";
  block.appendChild(label);

  const input = doc.createElement("input");
  input.type = "url";
  input.placeholder = "https://…";
  block.appendChild(input);

  const button = doc.createElement("button");
  button.textContent = "Subscribe";
  block.appendChild(button);

  const status = doc.createElement("span");
  block.appendChild(status);

  button.addEventListener("click", () => {
    button.disabled = true;
    status.textContent = "Checking…";
    void onSubscribe(source.id, input.value).then((res) => {
      if (res.ok) return; // popup refreshes; this block is replaced
      button.disabled = false;
      status.textContent =
        res.reason === "not-https"
          ? "Only https feeds are allowed."
          : res.reason === "no-feed"
            ? "No feed found at that URL."
            : "Could not reach that URL.";
    });
  });

  return block;
}
