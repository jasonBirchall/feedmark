import browser from "webextension-polyfill";
import { renderSources } from "./render.ts";
import type {
  GetItemsRequest,
  GetItemsResponse,
  MarkItemReadRequest,
  SubscribeRequest,
  SubscribeResponse,
} from "./messages.ts";

// The popup shell: ask the background for the per-source view and render it. No
// network here — the background's alarm poll fetched the items; subscribing also
// messages the background, which is the only fetcher.
async function renderApp(root: HTMLElement): Promise<void> {
  root.textContent = ""; // clear before re-render

  const request: GetItemsRequest = { type: "getItems" };
  const response = (await browser.runtime.sendMessage(request)) as GetItemsResponse | undefined;
  const sources = response?.sources ?? [];

  if (sources.length === 0) {
    const empty = document.createElement("p");
    empty.textContent = "No items yet.";
    root.appendChild(empty);
    return;
  }

  root.appendChild(
    renderSources(sources, document, {
      // Toggling a source's fold is popup-local display — no message, no write.
      onSubscribe: async (id, feedUrl) => {
        const req: SubscribeRequest = { type: "subscribe", id, feedUrl };
        const res = (await browser.runtime.sendMessage(req)) as SubscribeResponse;
        if (res.ok) await renderApp(root); // re-render so the source shows as a feed
        return res;
      },
      // Reading an item is fire-and-forget (messages.ts): the background
      // persists and recomputes the badge; the popup's own display update is
      // handled inside renderSources, no reply needed.
      onItemRead: (id, guid) => {
        const req: MarkItemReadRequest = { type: "markItemRead", id, guid };
        void browser.runtime.sendMessage(req);
      },
    }),
  );
}

async function main(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) return;
  await renderApp(root);
}

void main();
