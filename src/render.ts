import { MAX_POPUP_ITEMS } from "./config.ts";
import type { ParsedItem } from "./parseFeed.ts";
import type { FeedView, SubscribeResponse } from "./messages.ts";

// The load-bearing render invariant (THREAT_MODEL.md §4): feed-derived strings
// reach the DOM via textContent ONLY, never innerHTML. A script/onerror payload
// hidden in a feed title therefore lands as inert text. `doc` is injected so the
// invariant is unit-testable without a real browser (render.test.ts).
// Shows at most MAX_POPUP_ITEMS rows (display cap — storage keeps up to MAX_ITEMS).
//
// Since iter D every row is an action. An item with a link renders as a plain
// anchor — href consumed as https-or-null BY CONSTRUCTION from the parser gate
// (iter A); the renderer deliberately does not re-validate. target="_blank"
// opens the article in a new focused tab (which closes the popup);
// rel="noopener" denies the article page a window.opener handle back to this
// extension page. A linkless item renders as a button: clicking marks it read
// with no navigation (customer decision, iter D), so a link-poor feed can never
// pin the badge. onRead fires in both cases; only the linkless row is removed
// in place — the popup stays open there, and an unchanged row would read as a
// broken click. No backfill surgery: the next expand or open re-derives.
export function renderItems(
  items: ParsedItem[],
  doc: Document,
  onRead: (guid: string) => void,
): HTMLElement {
  const list = doc.createElement("ul");
  list.className = "items";
  for (const item of items.slice(0, MAX_POPUP_ITEMS)) {
    const row = doc.createElement("li");
    if (item.link !== null) {
      const link = doc.createElement("a");
      link.className = "item-link";
      link.textContent = item.title;
      link.href = item.link;
      link.target = "_blank";
      link.rel = "noopener";
      link.addEventListener("click", () => onRead(item.guid)); // navigation proceeds per default
      row.appendChild(link);
    } else {
      const mark = doc.createElement("button");
      mark.className = "item-mark";
      mark.textContent = item.title;
      mark.addEventListener("click", () => {
        onRead(item.guid);
        list.removeChild(row);
      });
      row.appendChild(mark);
    }
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
    onItemRead: (id: string, guid: string) => void;
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
    let count: HTMLElement | null = null;
    if (source.state === "feed") {
      count = doc.createElement("span");
      count.className = source.unread === 0 ? "count zero" : "count";
      count.textContent = String(source.unread);
      header.appendChild(count);
    }
    section.appendChild(header);

    // Guids read in THIS popup session (iter D). The background owns read
    // state; this set is not a second copy of it, only the popup applying its
    // own just-fired actions to its own open-time snapshot — without it, a
    // collapse would resurrect a just-read item (the body rebuilds from
    // source.items) and the pill couldn't drop while the popup stays open.
    // Ephemeral like the fold: gone when the popup closes, and the next open
    // renders purely from the background's derived state.
    const readLocal = new Set<string>();
    let unread = source.unread;
    const onRead = (guid: string): void => {
      if (readLocal.has(guid)) return; // e.g. a ctrl-clicked anchor clicked again
      readLocal.add(guid);
      handlers.onItemRead(source.id, guid);
      unread -= 1;
      if (count) {
        count.textContent = String(unread);
        count.className = unread === 0 ? "count zero" : "count";
      }
    };

    let body: HTMLElement | null = null;
    header.addEventListener("click", () => {
      if (body) {
        section.removeChild(body);
        body = null;
        return;
      }
      body = renderBody(source, readLocal, doc, handlers.onSubscribe, onRead);
      section.appendChild(body);
    });

    root.appendChild(section);
  }
  return root;
}

// What an expanded source shows: its unread items (the background sends only
// unread, via the shared readState predicate — the popup never re-derives from
// readGuids; subtracting this session's own readLocal clicks is the one
// exception, and it lets older unread items past the window backfill on
// re-expand), or the paste field for a source with no feed.
function renderBody(
  source: FeedView,
  readLocal: Set<string>,
  doc: Document,
  onSubscribe: (id: string, feedUrl: string) => Promise<SubscribeResponse>,
  onRead: (guid: string) => void,
): HTMLElement {
  if (source.state !== "feed") return renderNoFeed(source, doc, onSubscribe);
  const items = source.items.filter((item) => !readLocal.has(item.guid));
  if (items.length === 0) {
    // Nothing unread: a single muted line, so expanding never reads as a broken
    // click ("keep it boring" — customer decision, iter C).
    const empty = doc.createElement("p");
    empty.className = "empty";
    empty.textContent = "Nothing unread.";
    return empty;
  }
  return renderItems(items, doc, onRead);
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
