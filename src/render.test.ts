import { test } from "node:test";
import assert from "node:assert/strict";
import { renderItems, renderSources } from "./render.ts";
import { parseFeed } from "./parseFeed.ts";
import type { ParsedItem } from "./parseFeed.ts";
import type { FeedView, SubscribeResponse } from "./messages.ts";
import { MAX_POPUP_ITEMS } from "./config.ts";

// A minimal fake DOM. Its whole job is to prove the render path uses textContent
// and NEVER innerHTML: the innerHTML setter throws, so any use fails the test.
class FakeEl {
  readonly tag: string;
  readonly children: FakeEl[] = [];
  href = "";
  target = "";
  rel = "";
  value = "";
  disabled = false;
  type = "";
  placeholder = "";
  className = "";
  #text = "";
  #listeners: Record<string, Array<() => void>> = {};
  constructor(tag: string) {
    this.tag = tag;
  }
  get textContent(): string {
    return this.#text;
  }
  set textContent(value: string) {
    this.#text = value;
  }
  appendChild(child: FakeEl): FakeEl {
    this.children.push(child);
    return child;
  }
  removeChild(child: FakeEl): FakeEl {
    const at = this.children.indexOf(child);
    if (at === -1) throw new Error("removeChild: not a child of this element");
    this.children.splice(at, 1);
    return child;
  }
  addEventListener(type: string, handler: () => void): void {
    (this.#listeners[type] ??= []).push(handler);
  }
  click(): void {
    for (const handler of this.#listeners["click"] ?? []) handler();
  }
  set innerHTML(_value: string) {
    throw new Error("innerHTML must never be set on feed-derived content");
  }
}

class FakeDoc {
  createElement(tag: string): FakeEl {
    return new FakeEl(tag);
  }
}

// Items default to linkless — such an item renders as a mark-read button, a
// linked one as an anchor (iter D). Either way the title text lives on the
// row's single child, which is where these tests read it.
function item(over: Partial<ParsedItem> = {}): ParsedItem {
  return { guid: "g", title: "T", link: null, ...over };
}

function rowText(row: FakeEl | undefined): string | undefined {
  return row?.children[0]?.textContent;
}

function render(items: ParsedItem[], onRead: (guid: string) => void = () => {}): FakeEl {
  const doc = new FakeDoc();
  return renderItems(items, doc as unknown as Document, onRead) as unknown as FakeEl;
}

// A feed delivers live markup into a title via CDATA — the realistic vector.
function feedWithTitle(payload: string): ParsedItem[] {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><item><title><![CDATA[${payload}]]></title><guid>g</guid></item></channel></rss>`;
  return parseFeed(xml);
}

test("renders one row per item, title as text", () => {
  const root = render([item({ guid: "a", title: "Alpha" }), item({ guid: "b", title: "Beta" })]);
  assert.deepEqual(root.children.map(rowText), ["Alpha", "Beta"]);
});

test("renders an empty list for no items", () => {
  const root = render([]);
  assert.equal(root.children.length, 0);
});

// The display cap (iter 8.75): storage holds up to MAX_ITEMS, the popup shows
// at most MAX_POPUP_ITEMS per source, first-in-stored-order.
test("renders at most MAX_POPUP_ITEMS item rows", () => {
  const items = Array.from({ length: MAX_POPUP_ITEMS + 1 }, (_, i) =>
    item({ guid: `g${i}`, title: `Item ${i}` }),
  );
  const root = render(items);
  assert.equal(root.children.length, MAX_POPUP_ITEMS);
  assert.equal(rowText(root.children[0]), "Item 0");
});

// THE render-invariant gate (THREAT_MODEL.md §4 / PROJECT.md iter 3): a script
// payload pushed through parse -> render must come out as inert text.
test("a <script> payload from a feed title renders as inert text", () => {
  const payload = `<script>alert(1)</script>`;
  const items = feedWithTitle(payload);
  assert.equal(items[0]?.title, payload); // CDATA delivered live markup as a string
  const root = render(items);
  assert.equal(root.children.length, 1);
  // The dangerous string survives verbatim as TEXT: assigned via textContent,
  // never interpreted as HTML. (Any innerHTML use would have thrown above.)
  assert.equal(rowText(root.children[0]), payload);
});

test("an onerror img payload renders as inert text", () => {
  const payload = `<img src=x onerror=alert(1)>`;
  const items = feedWithTitle(payload);
  const root = render(items);
  assert.equal(rowText(root.children[0]), payload);
});

function view(over: Partial<FeedView> = {}): FeedView {
  return {
    id: "s",
    title: "Source",
    unread: 0,
    items: [],
    state: "feed",
    ...over,
  };
}

function renderSrc(
  sources: FeedView[],
  handlers: {
    onSubscribe?: (id: string, feedUrl: string) => Promise<SubscribeResponse>;
    onItemRead?: (id: string, guid: string) => void;
  } = {},
): FakeEl {
  const doc = new FakeDoc();
  return renderSources(sources, doc as unknown as Document, {
    onSubscribe: handlers.onSubscribe ?? (async () => ({ ok: false, reason: "no-feed" })),
    onItemRead: handlers.onItemRead ?? (() => {}),
  }) as unknown as FakeEl;
}

// C1: the fold. Opening the popup shows every source collapsed — header row
// only (title + pill), no items, no paste field — regardless of source state.
test("opening renders every source collapsed: header only", () => {
  const root = renderSrc([
    view({ title: "Alpha", unread: 2, items: [item({ guid: "a", title: "Story" })] }),
    view({ id: "n", title: "NoFeed", state: "no-feed" }),
  ]);
  assert.equal(root.children.length, 2);
  for (const section of root.children) {
    assert.equal(section.children.length, 1); // the header row and nothing else
  }
});

// C2: clicking a source header toggles its items open and closed. Toggling is
// pure display — no handler fires, nothing is stored (there is no handler to
// fire: the fold takes no callback at all).
test("clicking a header toggles the source's items open and closed", () => {
  const root = renderSrc([view({ unread: 1, items: [item({ guid: "a", title: "Story" })] })]);
  const section = root.children[0];
  const header = section?.children[0];

  header?.click(); // open
  assert.equal(section?.children.length, 2);
  const list = section?.children[1];
  assert.deepEqual(list?.children.map(rowText), ["Story"]);

  header?.click(); // close
  assert.equal(section?.children.length, 1);
});

// A source with nothing unread still expands — to a single muted line, so the
// click never reads as broken ("keep it boring": customer decision, iter C).
test("a source with zero unread expands to a 'Nothing unread.' line", () => {
  const root = renderSrc([view({ unread: 0, items: [] })]);
  const section = root.children[0];
  section?.children[0]?.click(); // expand
  const body = section?.children[1];
  assert.equal(body?.tag, "p");
  assert.equal(body?.className, "empty");
  assert.equal(body?.textContent, "Nothing unread.");
});

test("renders one labelled section per source: title and count pill", () => {
  const root = renderSrc([view({ title: "Alpha", unread: 2 }), view({ title: "Beta", unread: 0 })]);
  const headers = root.children.map((section) => section.children[0]);
  assert.deepEqual(
    headers.map((h) => h?.children[0]?.textContent),
    ["Alpha", "Beta"],
  );
  assert.deepEqual(
    headers.map((h) => h?.children[1]?.textContent),
    ["2", "0"],
  );
});

// The render-invariant gate extended to bookmark titles: a source's heading is
// derived text like any item title, and must reach the DOM as inert text only.
test("a <script> payload in a source title renders as inert text", () => {
  const payload = `<script>alert(1)</script>`;
  const root = renderSrc([view({ title: payload, unread: 1 })]);
  const heading = root.children[0]?.children[0]?.children[0];
  assert.equal(heading?.textContent, payload);
});

// A no-feed source folds like the rest (customer decision, iter C): collapsed
// row with no pill; expanding reveals the paste block instead of items.
test("a no-feed source expands to a paste field instead of items", () => {
  const root = renderSrc([view({ title: "Simon Willison", state: "no-feed" })]);
  const section = root.children[0];
  const header = section?.children[0];
  assert.equal(header?.children[0]?.textContent, "Simon Willison");
  assert.equal(header?.children.length, 1); // no count pill on a no-feed source
  header?.click(); // expand
  // The block after the header holds the paste UI: a label, an input, a button.
  const block = section?.children[1];
  const tags = block?.children.map((c) => c.tag);
  assert.ok(tags?.includes("input"));
  assert.ok(tags?.includes("button"));
  const button = block?.children.find((c) => c.tag === "button");
  assert.equal(button?.textContent, "Subscribe");
});

test("the count pill carries the zero marker class only at zero", () => {
  const root = renderSrc([view({ unread: 3 }), view({ unread: 0 })]);
  const counts = root.children.map((section) => section.children[0]?.children[1]);
  assert.equal(counts[0]?.className, "count");
  assert.equal(counts[1]?.className, "count zero");
});

// The stylesheet's hooks. A typo'd class name keeps every behavioural test
// green while silently un-styling the popup, so pin each class popup.css
// targets. count/zero are already pinned by the zero-marker test above.
test("render emits the class hooks popup.css styles", () => {
  const root = renderSrc([
    view({
      title: "A",
      unread: 2,
      items: [
        item({ guid: "g", title: "T", link: "https://a.test/t" }),
        item({ guid: "h", title: "U" }),
      ],
    }),
    view({ id: "n", title: "B", state: "no-feed" }),
  ]);
  for (const section of root.children) section.children[0]?.click(); // expand both
  const fed = root.children[0];
  assert.equal(fed?.className, "source");
  assert.equal(fed?.children[0]?.className, "source-header");
  assert.equal(fed?.children[0]?.children[0]?.className, "source-title");
  assert.equal(fed?.children[1]?.className, "items");
  assert.equal(fed?.children[1]?.children[0]?.children[0]?.className, "item-link");
  assert.equal(fed?.children[1]?.children[1]?.children[0]?.className, "item-mark");
  const block = root.children[1]?.children[1];
  assert.equal(block?.className, "no-feed");
  assert.equal(block?.children.find((c) => c.tag === "span")?.className, "status");
});

test("subscribing with an http url shows the inline https error", async () => {
  const root = renderSrc([view({ id: "x", state: "no-feed" })], {
    onSubscribe: async () => ({ ok: false, reason: "not-https" }),
  });
  root.children[0]?.children[0]?.click(); // expand to reach the paste field
  const block = root.children[0]?.children[1];
  const input = block?.children.find((c) => c.tag === "input");
  const button = block?.children.find((c) => c.tag === "button");
  const status = block?.children.find((c) => c.tag === "span");
  if (input) input.value = "http://site.test/feed";
  button?.click();
  await new Promise((resolve) => setTimeout(resolve, 0)); // flush the async handler
  assert.equal(status?.textContent, "Only https feeds are allowed.");
  assert.equal(button?.disabled, false); // re-enabled so the human can correct it
});

// The render-invariant gate through the fold: a script payload in an item
// title, parsed from a real feed body, stays inert text when revealed by
// expanding its source — the new path from parse to row.
test("a <script> payload in an item renders inert inside an expanded fold", () => {
  const payload = `<script>alert(1)</script>`;
  const root = renderSrc([view({ unread: 1, items: feedWithTitle(payload) })]);
  const section = root.children[0];
  section?.children[0]?.click(); // expand
  assert.equal(rowText(section?.children[1]?.children[0]), payload);
});

// C3's window bound through the fold: an expanded source shows at most
// MAX_POPUP_ITEMS rows, in the order given (newest first as stored — customer
// decision, iter C; older unread backfill from below as the window drains).
test("an expanded source windows its items to MAX_POPUP_ITEMS", () => {
  const items = Array.from({ length: MAX_POPUP_ITEMS + 2 }, (_, i) =>
    item({ guid: `g${i}`, title: `Item ${i}` }),
  );
  const root = renderSrc([view({ unread: items.length, items })]);
  const section = root.children[0];
  section?.children[0]?.click(); // expand
  const list = section?.children[1];
  assert.equal(list?.children.length, MAX_POPUP_ITEMS);
  assert.equal(rowText(list?.children[0]), "Item 0");
});

// The old open-site + clear-count click-through is retired (customer decision,
// iter C): the header is a toggle button, never a link. Since iter D the site
// url doesn't even reach the popup — FeedView no longer carries it.
test("a source header is a toggle button, not a link", () => {
  const root = renderSrc([view({ id: "moz", title: "Mozilla", unread: 3 })]);
  const header = root.children[0]?.children[0];
  assert.equal(header?.tag, "button");
  assert.equal(header?.href, ""); // no site click-through anywhere in the row
  assert.equal(header?.children[0]?.href, "");
});

// ---- Iteration D: click to read ----

// A feed body whose one item carries the given link, so these tests exercise
// the real parser gate -> render path, not a hand-built ParsedItem.
function feedWithLink(link: string): ParsedItem[] {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><item><title>Story</title><guid>g1</guid><link>${link}</link></item></channel></rss>`;
  return parseFeed(xml);
}

// D1's render half: a linked item is a plain anchor — real href, new-tab
// target, and rel=noopener so the article page gets no window.opener handle
// back to this extension page. The href comes from the parser gate untouched.
test("an item with a link renders as a new-tab noopener anchor", () => {
  const root = render(feedWithLink("https://a.test/story"));
  const link = root.children[0]?.children[0];
  assert.equal(link?.tag, "a");
  assert.equal(link?.href, "https://a.test/story");
  assert.equal(link?.target, "_blank");
  assert.equal(link?.rel, "noopener");
  assert.equal(link?.textContent, "Story");
});

// D4: a linkless item is a button — markable, never navigable. No href exists
// anywhere in the row.
test("a linkless item renders as a mark-read button with no href", () => {
  const root = render([item({ guid: "a", title: "No link here" })]);
  const row = root.children[0];
  assert.equal(row?.children[0]?.tag, "button");
  assert.equal(row?.children[0]?.href, "");
  assert.equal(row?.href, "");
});

// D4's "in no case renders a non-https href", proven through the real path: a
// hostile link is rejected at the parser (iter A), so the renderer — which
// never re-validates — can only ever see null and renders the button row.
test("a javascript: link from a feed renders as the linkless button row", () => {
  for (const hostile of ["javascript:alert(1)", "data:text/html,x", "http://a.test/x"]) {
    const root = render(feedWithLink(hostile));
    const row = root.children[0];
    assert.equal(row?.children[0]?.tag, "button");
    assert.equal(row?.children[0]?.href, "");
  }
});

// The render invariant holds on the new anchor path: a payload title inside a
// LINKED item still reaches the DOM as inert text.
test("a <script> payload in a linked item's title renders as inert text", () => {
  const payload = `<script>alert(1)</script>`;
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><item><title><![CDATA[${payload}]]></title><guid>g</guid><link>https://a.test/x</link></item></channel></rss>`;
  const root = render(parseFeed(xml));
  const link = root.children[0]?.children[0];
  assert.equal(link?.tag, "a");
  assert.equal(link?.textContent, payload);
});

// D2's popup half for a linked item: clicking fires markItemRead with the
// source's id and the item's guid, and the pill drops by one immediately. The
// row itself is left alone — the browser is navigating and the popup is about
// to close; surgery on a navigating anchor buys nothing.
test("clicking a linked item fires onItemRead and drops the pill", () => {
  const reads: string[] = [];
  const root = renderSrc(
    [
      view({
        id: "src1",
        unread: 3,
        items: [item({ guid: "g1", title: "T", link: "https://a.test/t" })],
      }),
    ],
    { onItemRead: (id, guid) => reads.push(`${id}:${guid}`) },
  );
  const section = root.children[0];
  section?.children[0]?.click(); // expand
  const pill = section?.children[0]?.children[1];
  section?.children[1]?.children[0]?.children[0]?.click(); // the anchor
  assert.deepEqual(reads, ["src1:g1"]);
  assert.equal(pill?.textContent, "2");
  assert.equal(pill?.className, "count");
});

// A second click on the same still-rendered anchor (e.g. after a ctrl-click
// opened it in the background and the popup stayed up) must not fire a second
// message or drop the pill twice — read is once per item per popup session.
test("re-clicking an already-read anchor neither re-fires nor re-drops", () => {
  const reads: string[] = [];
  const root = renderSrc(
    [view({ id: "s", unread: 2, items: [item({ guid: "g1", link: "https://a.test/t" })] })],
    { onItemRead: (_id, guid) => reads.push(guid) },
  );
  const section = root.children[0];
  section?.children[0]?.click(); // expand
  const anchor = section?.children[1]?.children[0]?.children[0];
  anchor?.click();
  anchor?.click();
  assert.deepEqual(reads, ["g1"]);
  assert.equal(section?.children[0]?.children[1]?.textContent, "1");
});

// D4 + D2 for a linkless item: the click marks it read (no navigation exists to
// close the popup), the row disappears in place, and the pill drops — reaching
// the zero class when it was the last unread item.
test("clicking a linkless item marks it read, removes the row, zeroes the pill", () => {
  const reads: string[] = [];
  const root = renderSrc([view({ id: "s", unread: 1, items: [item({ guid: "g1" })] })], {
    onItemRead: (_id, guid) => reads.push(guid),
  });
  const section = root.children[0];
  section?.children[0]?.click(); // expand
  const list = section?.children[1];
  list?.children[0]?.children[0]?.click(); // the button
  assert.deepEqual(reads, ["g1"]);
  assert.equal(list?.children.length, 0); // the row is gone, no grey-out
  const pill = section?.children[0]?.children[1];
  assert.equal(pill?.textContent, "0");
  assert.equal(pill?.className, "count zero");
});

// Collapsing and re-expanding after a read must not resurrect the item: the
// body rebuilds from the popup's snapshot, filtered by this session's reads.
// With everything read, the rebuild is the boring empty line.
test("a read item stays gone across collapse and re-expand", () => {
  const root = renderSrc([view({ unread: 1, items: [item({ guid: "g1", title: "T" })] })]);
  const section = root.children[0];
  const header = section?.children[0];
  header?.click(); // expand
  section?.children[1]?.children[0]?.children[0]?.click(); // read the only item
  header?.click(); // collapse
  header?.click(); // re-expand
  assert.equal(section?.children[1]?.tag, "p");
  assert.equal(section?.children[1]?.textContent, "Nothing unread.");
});

// The journey's backfill, popup-side: with more unread than the window shows,
// reading one and re-expanding pulls the next older unread item into view.
test("re-expanding after a read backfills the window from older unread items", () => {
  const items = Array.from({ length: MAX_POPUP_ITEMS + 1 }, (_, i) =>
    item({ guid: `g${i}`, title: `Item ${i}` }),
  );
  const root = renderSrc([view({ unread: items.length, items })]);
  const section = root.children[0];
  const header = section?.children[0];
  header?.click(); // expand: Items 0..9
  section?.children[1]?.children[0]?.children[0]?.click(); // read Item 0
  header?.click(); // collapse
  header?.click(); // re-expand
  const list = section?.children[1];
  assert.equal(list?.children.length, MAX_POPUP_ITEMS); // Item 10 backfilled
  assert.equal(rowText(list?.children[0]), "Item 1");
  assert.equal(rowText(list?.children[MAX_POPUP_ITEMS - 1]), `Item ${MAX_POPUP_ITEMS}`);
});
