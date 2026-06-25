import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchFeed } from "./fetchFeed.ts";

const FEED = {
  url: "https://x.test/feed",
  origin: "https://x.test",
  etag: null,
  lastModified: null,
};

function okResponse(body: string, headers: Record<string, string> = {}) {
  return new Response(body, { status: 200, headers });
}

test("refuses non-https before any fetch", async () => {
  let called = false;
  const result = await fetchFeed(
    { ...FEED, url: "http://x.test/feed" },
    {
      fetchImpl: async () => {
        called = true;
        return okResponse("x");
      },
    },
  );
  assert.equal(result.kind, "failed");
  assert.equal(called, false);
});

test("does not follow redirects and rejects them", async () => {
  const result = await fetchFeed(FEED, {
    fetchImpl: async () => new Response(null, { status: 301 }),
  });
  assert.equal(result.kind, "failed");
});

test("rejects a body over the size cap", async () => {
  const huge = "a".repeat(100);
  const result = await fetchFeed(FEED, {
    fetchImpl: async () => okResponse(huge),
    maxBytes: 10,
  });
  assert.deepEqual(result, { kind: "failed", reason: "too-large" });
});

test("times out via AbortController", async () => {
  const result = await fetchFeed(FEED, {
    timeoutMs: 5,
    fetchImpl: (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }),
  });
  assert.deepEqual(result, { kind: "failed", reason: "timeout" });
});

test("304 returns notModified and sends conditional headers", async () => {
  let sent: Headers | undefined;
  const result = await fetchFeed(
    { ...FEED, etag: 'W/"abc"', lastModified: "yesterday" },
    {
      fetchImpl: async (_url, init) => {
        sent = new Headers(init?.headers);
        return new Response(null, { status: 304 });
      },
    },
  );
  assert.deepEqual(result, { kind: "notModified" });
  assert.equal(sent?.get("If-None-Match"), 'W/"abc"');
  assert.equal(sent?.get("If-Modified-Since"), "yesterday");
});

test("200 returns ok with body and validators", async () => {
  const result = await fetchFeed(FEED, {
    fetchImpl: async () => okResponse("<rss/>", { ETag: 'W/"v2"', "Last-Modified": "now" }),
  });
  assert.equal(result.kind, "ok");
  if (result.kind === "ok") {
    assert.equal(result.body, "<rss/>");
    assert.equal(result.etag, 'W/"v2"');
    assert.equal(result.lastModified, "now");
  }
});
