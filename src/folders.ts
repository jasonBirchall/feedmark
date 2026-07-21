import type { BookmarkNode } from "./source.ts";

// The options-page picker's folder list (iter E), pure and polyfill-free like
// source.ts so it unit-tests under Node. The input is what bookmarks.getTree
// resolves to: one unnamed root whose children are the browser's own
// containers ("Bookmarks Menu", "Bookmarks Toolbar", ...).
export type FolderChoice = {
  id: string;
  path: string; // ancestor titles joined with " / " — the <select> label
};

// Every folder in the tree, flattened depth-first and labelled by path. The
// unnamed tree root is excluded (no browser UI presents it as a folder); the
// titled containers are listed like any other folder. A node is a folder when
// it has no url — except Firefox separators, which also have no url and are
// excluded by type. Folder titles are user-authored, not feed-supplied, but
// the textContent-only render invariant applies to them all the same
// (optionsRender.ts).
export function listFolders(roots: BookmarkNode[]): FolderChoice[] {
  const folders: FolderChoice[] = [];
  const walk = (node: BookmarkNode, trail: string[]): void => {
    for (const child of node.children ?? []) {
      if (child.url || child.type === "separator") continue;
      const path = [...trail, child.title];
      folders.push({ id: child.id, path: path.join(" / ") });
      walk(child, path);
    }
  };
  for (const root of roots) walk(root, []);
  return folders;
}
