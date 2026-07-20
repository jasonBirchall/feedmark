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

// Items default to linkless: iteration A only admits `link` into the parsed
// shape, so nothing renders from it yet. Iteration D is where it becomes an href.
function item(over: Partial<ParsedItem> = {}): ParsedItem {
  return { guid: "g", title: "T", link: null, ...over };
}

function render(items: ParsedItem[]): FakeEl {
  const doc = new FakeDoc();
  return renderItems(items, doc as unknown as Document) as unknown as FakeEl;
}

// A feed delivers live markup into a title via CDATA — the realistic vector.
function feedWithTitle(payload: string): ParsedItem[] {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel><item><title><![CDATA[${payload}]]></title><guid>g</guid></item></channel></rss>`;
  return parseFeed(xml);
}

test("renders one row per item, title as text", () => {
  const root = render([item({ guid: "a", title: "Alpha" }), item({ guid: "b", title: "Beta" })]);
  assert.deepEqual(
    root.children.map((li) => li.textContent),
    ["Alpha", "Beta"],
  );
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
  assert.equal(root.children[0]?.textContent, "Item 0");
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
  assert.equal(root.children[0]?.textContent, payload);
});

test("an onerror img payload renders as inert text", () => {
  const payload = `<img src=x onerror=alert(1)>`;
  const items = feedWithTitle(payload);
  const root = render(items);
  assert.equal(root.children[0]?.textContent, payload);
});

function view(over: Partial<FeedView> = {}): FeedView {
  return {
    id: "s",
    url: "https://s.test/",
    title: "Source",
    unread: 0,
    items: [],
    state: "feed",
    ...over,
  };
}

function renderSrc(
  sources: FeedView[],
  onOpen: (id: string) => void = () => {},
  onSubscribe: (id: string, feedUrl: string) => Promise<SubscribeResponse> = async () => ({
    ok: false,
    reason: "no-feed",
  }),
): FakeEl {
  const doc = new FakeDoc();
  return renderSources(sources, doc as unknown as Document, {
    onOpen,
    onSubscribe,
  }) as unknown as FakeEl;
}

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

test("a source's items render as text beneath its heading", () => {
  const root = renderSrc([
    view({ title: "Alpha", unread: 1, items: [item({ guid: "a", title: "Story" })] }),
  ]);
  const section = root.children[0];
  const list = section?.children[1]; // [0] header row, [1] the item list
  assert.deepEqual(
    list?.children.map((li) => li.textContent),
    ["Story"],
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

test("a no-feed source renders a paste field instead of items", () => {
  const root = renderSrc([view({ title: "Simon Willison", state: "no-feed" })]);
  const section = root.children[0];
  const header = section?.children[0];
  assert.equal(header?.children[0]?.textContent, "Simon Willison");
  assert.equal(header?.children.length, 1); // no count pill on a no-feed source
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
    view({ title: "A", unread: 1, items: [item({ guid: "g", title: "T" })] }),
    view({ id: "n", title: "B", state: "no-feed" }),
  ]);
  const fed = root.children[0];
  assert.equal(fed?.className, "source");
  assert.equal(fed?.children[0]?.className, "source-header");
  assert.equal(fed?.children[0]?.children[0]?.className, "source-title");
  assert.equal(fed?.children[1]?.className, "items");
  const block = root.children[1]?.children[1];
  assert.equal(block?.className, "no-feed");
  assert.equal(block?.children.find((c) => c.tag === "span")?.className, "status");
});

test("subscribing with an http url shows the inline https error", async () => {
  const root = renderSrc(
    [view({ id: "x", state: "no-feed" })],
    () => {},
    async () => ({
      ok: false,
      reason: "not-https",
    }),
  );
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

test("a source heading links to its site and signals a clear on click", () => {
  const opened: string[] = [];
  const root = renderSrc(
    [view({ id: "moz", url: "https://blog.mozilla.org/", title: "Mozilla", unread: 3 })],
    (id) => opened.push(id),
  );
  const link = root.children[0]?.children[0]?.children[0];
  assert.equal(link?.href, "https://blog.mozilla.org/"); // opens the site
  assert.equal(link?.textContent, "Mozilla");
  link?.click();
  assert.deepEqual(opened, ["moz"]); // clears the right source
});
