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

// One collapsed section per source (iter C): a header button holding the title
// and, for a resolved feed, an unread-count pill. Clicking the header toggles
// the source's body open and closed — pure display, no message, no storage
// write. The fold state is the body's presence in the DOM (per-section, via
// closure): ephemeral by construction, gone when the popup closes, everything
// collapsed on open. The old open-site + clear-count click-through is retired —
// the header is a button, never a link. The render invariant extends here: the
// bookmark title reaches the DOM via textContent only, never innerHTML; the
// count is extension-computed, never feed text.
export function renderSources(
  sources: FeedView[],
  doc: Document,
  handlers: {
    onSubscribe: (id: string, feedUrl: string) => Promise<SubscribeResponse>;
  },
): HTMLElement {
  const root = doc.createElement("div");
  for (const source of sources) {
    const section = doc.createElement("section");
    section.className = "source";

    const header = doc.createElement("button");
    header.className = "source-header";
    const heading = doc.createElement("span");
    heading.className = "source-title";
    heading.textContent = source.title;
    header.appendChild(heading);
    if (source.state === "feed") {
      const count = doc.createElement("span");
      count.className = source.unread === 0 ? "count zero" : "count";
      count.textContent = String(source.unread);
      header.appendChild(count);
    }
    section.appendChild(header);

    let body: HTMLElement | null = null;
    header.addEventListener("click", () => {
      if (body) {
        section.removeChild(body);
        body = null;
        return;
      }
      body = renderBody(source, doc, handlers.onSubscribe);
      section.appendChild(body);
    });

    root.appendChild(section);
  }
  return root;
}

// What an expanded source shows: its unread items (the background sends only
// unread, via the shared readState predicate — the popup never re-filters), or
// the paste field for a source with no feed.
function renderBody(
  source: FeedView,
  doc: Document,
  onSubscribe: (id: string, feedUrl: string) => Promise<SubscribeResponse>,
): HTMLElement {
  if (source.state !== "feed") return renderNoFeed(source, doc, onSubscribe);
  if (source.items.length === 0) {
    // Nothing unread: a single muted line, so expanding never reads as a broken
    // click ("keep it boring" — customer decision, iter C).
    const empty = doc.createElement("p");
    empty.className = "empty";
    empty.textContent = "Nothing unread.";
    return empty;
  }
  return renderItems(source.items, doc);
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
