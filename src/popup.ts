import browser from "webextension-polyfill";
import { renderSources } from "./render.ts";
import type { GetItemsRequest, GetItemsResponse } from "./messages.ts";

// The popup shell: ask the background for the per-source view and render it.
// No network here — opening the popup must not fire a single request (the items
// were fetched by the background's alarm poll and live in storage.local).
async function main(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) return;

  const request: GetItemsRequest = { type: "getItems" };
  const response = (await browser.runtime.sendMessage(request)) as GetItemsResponse | undefined;
  const sources = response?.sources ?? [];

  if (sources.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No items yet.";
    root.appendChild(empty);
    return;
  }

  root.appendChild(renderSources(sources, document));
}

void main();
