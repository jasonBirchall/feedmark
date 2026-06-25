import { test } from "node:test";
import assert from "node:assert/strict";
import { feedFromBookmark } from "./source.ts";

test("an https bookmark becomes a fresh feed record", () => {
  const rec = feedFromBookmark({
    id: "abc",
    title: "Feedmark",
    url: "https://blog.mozilla.org/feed/",
  });
  assert.equal(rec?.id, "abc");
  assert.equal(rec?.url, "https://blog.mozilla.org/feed/");
  assert.equal(rec?.origin, "https://blog.mozilla.org");
  assert.deepEqual(rec?.seenGuids, []);
  assert.equal(rec?.unread, 0);
  assert.deepEqual(rec?.items, []);
  assert.equal(rec?.etag, null);
  assert.equal(rec?.lastModified, null);
});

test("origin is derived from the host, not the path", () => {
  const rec = feedFromBookmark({
    id: "o",
    title: "Feedmark",
    url: "https://host.example/path/feed.xml",
  });
  assert.equal(rec?.origin, "https://host.example");
});

test("a folder (no url) is not a source", () => {
  assert.equal(feedFromBookmark({ id: "f", title: "Feedmark" }), null);
});

test("an http bookmark is refused (https-only)", () => {
  assert.equal(
    feedFromBookmark({ id: "h", title: "Feedmark", url: "http://blog.mozilla.org/feed/" }),
    null,
  );
});

test("a malformed url is not a source and does not throw", () => {
  assert.equal(feedFromBookmark({ id: "m", title: "Feedmark", url: "not a url" }), null);
});
