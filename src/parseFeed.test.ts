import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFeed } from "./parseFeed.ts";

const RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>T</title>
  <item><title>A</title><link>https://x.test/a</link><guid>guid-a</guid></item>
  <item><title>B</title><link>https://x.test/b</link><guid isPermaLink="false">guid-b</guid></item>
</channel></rss>`;

const ATOM = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>A</title><id>atom-a</id></entry>
  <entry><title>B</title><link href="https://x.test/b"/></entry>
</feed>`;

const RSS_NO_GUID = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item><title>A</title><link>https://x.test/a</link></item>
</channel></rss>`;

const RSS_NO_TITLE = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item><link>https://x.test/a</link><guid>guid-a</guid></item>
</channel></rss>`;

// Classic billion-laughs entity expansion.
const BILLION_LAUGHS = `<?xml version="1.0"?>
<!DOCTYPE lolz [
 <!ENTITY lol "lol">
 <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">
 <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">
]>
<rss version="2.0"><channel><item><guid>&lol3;</guid></item></channel></rss>`;

test("extracts RSS guids", () => {
  assert.deepEqual(
    parseFeed(RSS).map((i) => i.guid),
    ["guid-a", "guid-b"],
  );
});

test("extracts RSS titles", () => {
  assert.deepEqual(
    parseFeed(RSS).map((i) => i.title),
    ["A", "B"],
  );
});

test("extracts Atom ids, falling back to link", () => {
  assert.deepEqual(
    parseFeed(ATOM).map((i) => i.guid),
    ["atom-a", "https://x.test/b"],
  );
});

test("extracts Atom titles", () => {
  assert.deepEqual(
    parseFeed(ATOM).map((i) => i.title),
    ["A", "B"],
  );
});

test("title is empty string when absent", () => {
  assert.deepEqual(
    parseFeed(RSS_NO_TITLE).map((i) => i.title),
    [""],
  );
});

test("falls back to link when guid is missing", () => {
  assert.deepEqual(
    parseFeed(RSS_NO_GUID).map((i) => i.guid),
    ["https://x.test/a"],
  );
});

test("returns [] on malformed xml without throwing", () => {
  assert.deepEqual(parseFeed("<rss><channel><item>"), []);
  assert.deepEqual(parseFeed("not xml at all"), []);
});

test("entity expansion does not blow up (billion-laughs safe)", () => {
  const items = parseFeed(BILLION_LAUGHS);
  // Must complete quickly and not expand to a huge string.
  assert.ok(items.length <= 1);
  for (const i of items) assert.ok(i.guid.length < 1000);
});

test("caps at MAX_ITEMS (200)", () => {
  const many = Array.from({ length: 250 }, (_, n) => `<item><guid>g${n}</guid></item>`).join("");
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel>${many}</channel></rss>`;
  assert.equal(parseFeed(xml).length, 200);
});
