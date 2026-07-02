import { MAX_POPUP_ITEMS } from "./config.ts";
import type { ParsedItem } from "./parseFeed.ts";
import type { FeedView, SubscribeResponse } from "./messages.ts";

// The load-bearing render invariant (THREAT_MODEL.md §4): feed-derived strings
// reach the DOM via textContent ONLY, never innerHTML. A script/onerror payload
// hidden in a feed title therefore lands as inert text. `doc` is injected so the
// invariant is unit-testable without a real browser (render.test.ts).
// Shows at most MAX_POPUP_ITEMS rows (display cap — storage keeps up to MAX_ITEMS).
export function renderItems(items: ParsedItem[], doc: Document): HTMLElement {
  const list = doc.createElement("ul");
  list.className = "items";
  for (const item of items.slice(0, MAX_POPUP_ITEMS)) {
    const row = doc.createElement("li");
    row.textContent = item.title;
    list.appendChild(row);
  }
  return list;
}

// One labelled section per source: a header row holding a clickable title (links
// to the source's site) and, for a resolved feed, an unread-count pill — then that
// source's items. Clicking the title opens the site (the href) and calls onOpen so
// the caller can clear the count. The render invariant extends here — the bookmark
// title reaches the DOM via textContent only, never innerHTML; the href is the
// registration-validated https url. The count is extension-computed, never feed text.
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
    section.className = "source";

    const header = doc.createElement("div");
    header.className = "source-header";
    const heading = doc.createElement("a");
    heading.className = "source-title";
    heading.href = source.url; // the bookmark site — always the click-through
    heading.textContent = source.title;
    heading.addEventListener("click", () => handlers.onOpen(source.id));
    header.appendChild(heading);
    if (source.state === "feed") {
      const count = doc.createElement("span");
      count.className = source.unread === 0 ? "count zero" : "count";
      count.textContent = String(source.unread);
      header.appendChild(count);
    }
    section.appendChild(header);

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
  block.className = "no-feed";

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
  status.className = "status";
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
