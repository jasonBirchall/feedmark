import browser from "webextension-polyfill";
import { renderItems } from "./render.ts";
import type { GetItemsRequest, GetItemsResponse } from "./messages.ts";

// The popup shell: ask the background for the stored items and render them.
// No network here — opening the popup must not fire a single request (the items
// were fetched by the background's alarm poll and live in storage.local).
async function main(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) return;

  const request: GetItemsRequest = { type: "getItems" };
  const response = (await browser.runtime.sendMessage(request)) as GetItemsResponse | undefined;
  const items = response?.items ?? [];

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No items yet.";
    root.appendChild(empty);
    return;
  }

  root.appendChild(renderItems(items, document));
}

void main();
