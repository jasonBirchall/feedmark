import { test } from "node:test";
import assert from "node:assert/strict";
import { renderOptions } from "./optionsRender.ts";
import type { FolderChoice } from "./folders.ts";

// The same minimal fake DOM as render.test.ts, extended with the select
// semantics this surface needs. Its whole job is unchanged: prove the render
// path uses textContent and NEVER innerHTML — the innerHTML setter throws.
class FakeEl {
  readonly tag: string;
  readonly children: FakeEl[] = [];
  value = "";
  disabled = false;
  selected = false;
  className = "";
  id = "";
  htmlFor = "";
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
  change(): void {
    for (const handler of this.#listeners["change"] ?? []) handler();
  }
  set innerHTML(_value: string) {
    throw new Error("innerHTML must never be set on rendered content");
  }
}

class FakeDoc {
  createElement(tag: string): FakeEl {
    return new FakeEl(tag);
  }
}

const FOLDERS: FolderChoice[] = [
  { id: "menu", path: "Bookmarks Menu" },
  { id: "feeds", path: "Bookmarks Menu / Feeds" },
];

function render(
  folders: FolderChoice[] = FOLDERS,
  currentId: string | null = null,
  onChoose: (id: string) => Promise<boolean> = async () => true,
): { block: FakeEl; select: FakeEl; status: FakeEl } {
  const doc = new FakeDoc();
  const block = renderOptions(
    folders,
    currentId,
    doc as unknown as Document,
    onChoose,
  ) as unknown as FakeEl;
  const select = block.children.find((el) => el.tag === "select");
  const status = block.children.find((el) => el.className === "status");
  assert.ok(select && status);
  return { block, select, status };
}

// Waits out the microtask hop inside the change handler (onChoose is async).
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test("renders one option per folder, labelled by path", () => {
  const { select } = render(FOLDERS, "menu");
  assert.deepEqual(
    select.children.map((o) => o.textContent),
    ["Bookmarks Menu", "Bookmarks Menu / Feeds"],
  );
  assert.deepEqual(
    select.children.map((o) => o.value),
    ["menu", "feeds"],
  );
});

test("the current choice is pre-selected (E1)", () => {
  const { select } = render(FOLDERS, "feeds");
  assert.deepEqual(
    select.children.map((o) => o.selected),
    [false, true],
  );
});

test("with no current choice, a disabled placeholder holds the slot", () => {
  const { select } = render(FOLDERS, null);
  const first = select.children[0];
  assert.equal(first?.textContent, "Choose a folder…");
  assert.equal(first?.disabled, true);
  assert.equal(first?.selected, true);
  assert.equal(select.children.length, FOLDERS.length + 1);
});

test("with a current choice there is no placeholder", () => {
  const { select } = render(FOLDERS, "menu");
  assert.equal(select.children.length, FOLDERS.length);
});

test("choosing a folder fires onChoose with its id and reports Saved.", async () => {
  const chosen: string[] = [];
  const { select, status } = render(FOLDERS, null, async (id) => {
    chosen.push(id);
    return true;
  });
  select.value = "feeds";
  select.change();
  assert.equal(status.textContent, "Saving…"); // synchronous feedback first
  await settle();
  assert.deepEqual(chosen, ["feeds"]);
  assert.equal(status.textContent, "Saved.");
});

test("a refused choice (folder vanished) reports it and gives up nothing", async () => {
  const { select, status } = render(FOLDERS, "menu", async () => false);
  select.value = "feeds";
  select.change();
  await settle();
  assert.equal(status.textContent, "That folder is gone — choose another.");
});

// THE render-invariant gate on the third surface (E6, THREAT_MODEL.md §4):
// folder titles are user-authored, but a hostile payload in one must land as
// inert text all the same. Any innerHTML use would have thrown above.
test("a <script> payload in a folder title renders as inert text", () => {
  const payload = `<script>alert(1)</script>`;
  const { select } = render([{ id: "evil", path: payload }], null);
  assert.equal(select.children[1]?.textContent, payload);
});

test("an onerror img payload in a folder title renders as inert text", () => {
  const payload = `<img src=x onerror=alert(1)>`;
  const { select } = render([{ id: "evil", path: payload }], "evil");
  assert.equal(select.children[0]?.textContent, payload);
});

// The class hooks options.css styles against, pinned like the popup's (C5's
// pattern extended to this surface).
test("the options structure carries the pinned class hooks", () => {
  const { block, select, status } = render();
  assert.equal(block.className, "chooser");
  const label = block.children.find((el) => el.tag === "label");
  assert.equal(label?.className, "chooser-label");
  assert.equal(select.className, "folder-select");
  assert.equal(status.className, "status");
});

// The label reaches the control the accessible way: for/id, no nesting.
test("the label is wired to the select by id", () => {
  const { block, select } = render();
  const label = block.children.find((el) => el.tag === "label");
  assert.equal(label?.htmlFor, "folder-select");
  assert.equal(select.id, "folder-select");
});
