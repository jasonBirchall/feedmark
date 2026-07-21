import { test } from "node:test";
import assert from "node:assert/strict";
import { listFolders } from "./folders.ts";
import type { BookmarkNode } from "./source.ts";

// A realistic getTree shape: one unnamed root, titled containers beneath it.
function tree(children: BookmarkNode[]): BookmarkNode[] {
  return [{ id: "root________", title: "", children }];
}

test("lists every folder, labelled by its path", () => {
  const folders = listFolders(
    tree([
      {
        id: "menu",
        title: "Bookmarks Menu",
        children: [
          {
            id: "tech",
            title: "Tech",
            children: [{ id: "feeds", title: "Feeds", children: [] }],
          },
        ],
      },
      { id: "toolbar", title: "Bookmarks Toolbar", children: [] },
    ]),
  );
  assert.deepEqual(folders, [
    { id: "menu", path: "Bookmarks Menu" },
    { id: "tech", path: "Bookmarks Menu / Tech" },
    { id: "feeds", path: "Bookmarks Menu / Tech / Feeds" },
    { id: "toolbar", path: "Bookmarks Toolbar" },
  ]);
});

test("the unnamed tree root is not itself a choice", () => {
  const folders = listFolders(tree([{ id: "menu", title: "Bookmarks Menu", children: [] }]));
  assert.deepEqual(
    folders.map((f) => f.id),
    ["menu"],
  );
});

test("bookmarks and separators are not folders", () => {
  const folders = listFolders(
    tree([
      {
        id: "menu",
        title: "Bookmarks Menu",
        children: [
          { id: "bm", title: "A bookmark", url: "https://a.test/" },
          { id: "sep", title: "", type: "separator" }, // Firefox: no url, still not a folder
          { id: "sub", title: "Real folder", children: [] },
        ],
      },
    ]),
  );
  assert.deepEqual(
    folders.map((f) => f.id),
    ["menu", "sub"],
  );
});

test("an empty tree lists no folders", () => {
  assert.deepEqual(listFolders(tree([])), []);
  assert.deepEqual(listFolders([]), []);
});

// Two same-named folders stay distinct choices: identity is the id, the path
// label just happens to collide (E3 — the id is what gets stored).
test("same-named folders in different places are distinct choices", () => {
  const folders = listFolders(
    tree([
      { id: "menu", title: "Menu", children: [{ id: "f1", title: "Feeds", children: [] }] },
      { id: "toolbar", title: "Toolbar", children: [{ id: "f2", title: "Feeds", children: [] }] },
    ]),
  );
  assert.deepEqual(
    folders.filter((f) => f.path.endsWith("Feeds")).map((f) => f.id),
    ["f1", "f2"],
  );
});
