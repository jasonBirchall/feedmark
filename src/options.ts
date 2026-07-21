import browser from "webextension-polyfill";
import { renderOptions } from "./optionsRender.ts";
import type {
  GetFoldersRequest,
  GetFoldersResponse,
  SetFolderRequest,
  SetFolderResponse,
} from "./messages.ts";

// The options shell (iter E): ask the background for the folder list and the
// current choice, render the picker. Choosing messages setFolder — the
// background is the single writer of settings as of feeds; this page never
// touches storage.local. No network here either, ever: the folder list is a
// local bookmarks read.
async function renderApp(root: HTMLElement): Promise<void> {
  const request: GetFoldersRequest = { type: "getFolders" };
  const response = (await browser.runtime.sendMessage(request)) as GetFoldersResponse | undefined;
  root.appendChild(
    renderOptions(response?.folders ?? [], response?.currentId ?? null, document, async (id) => {
      const req: SetFolderRequest = { type: "setFolder", id };
      const res = (await browser.runtime.sendMessage(req)) as SetFolderResponse | undefined;
      return res?.ok ?? false;
    }),
  );
}

async function main(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) return;
  await renderApp(root);
}

void main();
