import { test } from "node:test";
import assert from "node:assert/strict";
import { renderItems, renderSources } from "./render.ts";
import { parseFeed } from "./parseFeed.ts";
import type { ParsedItem } from "./parseFeed.ts";
import type { FeedView } from "./messages.ts";

// A minimal fake DOM. Its whole job is to prove the render path uses textContent
// and NEVER innerHTML: the innerHTML setter throws, so any use fails the test.
class FakeEl {
  readonly tag: string;
  readonly children: FakeEl[] = [];
  #text = "";
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
  set innerHTML(_value: string) {
    throw new Error("innerHTML must never be set on feed-derived content");
  }
}

class FakeDoc {
  createElement(tag: string): FakeEl {
    return new FakeEl(tag);
  }
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
  const root = render([
    { guid: "a", title: "Alpha" },
    { guid: "b", title: "Beta" },
  ]);
  assert.deepEqual(
    root.children.map((li) => li.textContent),
    ["Alpha", "Beta"],
  );
});

test("renders an empty list for no items", () => {
  const root = render([]);
  assert.equal(root.children.length, 0);
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

function renderSrc(sources: FeedView[]): FakeEl {
  const doc = new FakeDoc();
  return renderSources(sources, doc as unknown as Document) as unknown as FakeEl;
}

test("renders one labelled section per source with its unread count", () => {
  const root = renderSrc([
    { title: "Alpha", unread: 2, items: [] },
    { title: "Beta", unread: 0, items: [] },
  ]);
  const headings = root.children.map((section) => section.children[0]?.textContent);
  assert.deepEqual(headings, ["Alpha (2)", "Beta (0)"]);
});

test("a source's items render as text beneath its heading", () => {
  const root = renderSrc([{ title: "Alpha", unread: 1, items: [{ guid: "a", title: "Story" }] }]);
  const section = root.children[0];
  const list = section?.children[1]; // [0] heading, [1] the item list
  assert.deepEqual(
    list?.children.map((li) => li.textContent),
    ["Story"],
  );
});

// The render-invariant gate extended to bookmark titles: a hostile title (a feed
// could have planted it, or a synced bookmark) must land as inert text too.
test("a <script> payload in a source title renders as inert text", () => {
  const payload = `<script>alert(1)</script>`;
  const root = renderSrc([{ title: payload, unread: 1, items: [] }]);
  const heading = root.children[0]?.children[0];
  assert.equal(heading?.textContent, `${payload} (1)`);
});
