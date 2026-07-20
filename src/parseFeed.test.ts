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

// Atom's <link> is an element with attributes, and an entry commonly carries
// several with different rels. Only rel="alternate" — or an absent rel, which
// the spec defaults to alternate — is the article itself; "edit", "self" and
// "replies" are feed plumbing, not somewhere to send the reader.
const ATOM_MULTI_LINK = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>A</title><id>atom-a</id>
    <link rel="edit" href="https://x.test/edit/a"/>
    <link rel="alternate" href="https://x.test/a"/>
    <link rel="replies" href="https://x.test/replies/a"/>
  </entry>
</feed>`;

// Every link is plumbing — there is no article link to offer.
const ATOM_NO_ALTERNATE = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>A</title><id>atom-a</id>
    <link rel="self" href="https://x.test/self/a"/>
  </entry>
</feed>`;

const RSS_NO_GUID = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item><title>A</title><link>https://x.test/a</link></item>
</channel></rss>`;

const RSS_NO_TITLE = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item><link>https://x.test/a</link><guid>guid-a</guid></item>
</channel></rss>`;

// An item carrying neither guid nor link — only a title to identify it by.
const RSS_TITLE_ONLY = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item><title>Only a title</title></item>
</channel></rss>`;

const ATOM_TITLE_ONLY = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>Only a title</title></entry>
</feed>`;

// Nothing to identify it by at all — no guid, no link, no title.
const RSS_ANONYMOUS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item><description>body but no identity</description></item>
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

test("carries the article's own https link from an RSS <link>", () => {
  assert.deepEqual(
    parseFeed(RSS).map((i) => i.link),
    ["https://x.test/a", "https://x.test/b"],
  );
});

test("carries the article's own https link from an Atom <link href>", () => {
  assert.deepEqual(
    parseFeed(ATOM).map((i) => i.link),
    [null, "https://x.test/b"],
  );
});

test("prefers the Atom rel=alternate link over other rels", () => {
  assert.deepEqual(
    parseFeed(ATOM_MULTI_LINK).map((i) => i.link),
    ["https://x.test/a"],
  );
});

test("has no link when an Atom entry offers no alternate", () => {
  assert.deepEqual(
    parseFeed(ATOM_NO_ALTERNATE).map((i) => i.link),
    [null],
  );
});

test("falls back to link when guid is missing", () => {
  assert.deepEqual(
    parseFeed(RSS_NO_GUID).map((i) => i.guid),
    ["https://x.test/a"],
  );
});

test("keeps an RSS item with only a title, using the title as identity", () => {
  assert.deepEqual(parseFeed(RSS_TITLE_ONLY), [
    { guid: "Only a title", title: "Only a title", link: null },
  ]);
});

test("keeps an Atom entry with only a title, using the title as identity", () => {
  assert.deepEqual(parseFeed(ATOM_TITLE_ONLY), [
    { guid: "Only a title", title: "Only a title", link: null },
  ]);
});

test("drops an item with no guid, link, or title (nothing to identify it by)", () => {
  assert.deepEqual(parseFeed(RSS_ANONYMOUS), []);
});

// The gate is the only checkpoint on the path from feed text to an href on an
// extension page — the renderer will not re-validate (THREAT_MODEL.md §4). Each
// payload is a way of arriving at a non-https scheme: outright script schemes,
// case variation, whitespace and newline obfuscation (the URL parser strips both
// before deciding the scheme, so neither smuggles anything past it), a silent
// downgrade to http, and protocol-relative or bare-relative forms that have no
// scheme at all. All must land on null, and none may cost us the item.
const HOSTILE_LINKS = [
  "javascript:alert(1)",
  "JavaScript:alert(1)",
  "  javascript:alert(1)  ",
  "java\nscript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
  "http://x.test/a",
  "//evil.test/x",
  "/relative/path",
  "not a url at all",
];

for (const payload of HOSTILE_LINKS) {
  test(`refuses a non-https item link: ${JSON.stringify(payload)}`, () => {
    const xml = `<?xml version="1.0"?><rss version="2.0"><channel>
      <item><title>A</title><guid>guid-a</guid><link>${payload}</link></item>
    </channel></rss>`;
    assert.deepEqual(parseFeed(xml), [{ guid: "guid-a", title: "A", link: null }]);
  });

  test(`refuses the same payload in an Atom href: ${JSON.stringify(payload)}`, () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <entry><title>A</title><id>atom-a</id><link href="${payload}"/></entry>
    </feed>`;
    assert.deepEqual(parseFeed(xml), [{ guid: "atom-a", title: "A", link: null }]);
  });
}

test("an item with a rejected link is kept, not dropped", () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel>
    <item><title>Good</title><guid>g1</guid><link>https://x.test/good</link></item>
    <item><title>Hostile</title><guid>g2</guid><link>javascript:alert(1)</link></item>
    <item><title>Linkless</title><guid>g3</guid></item>
  </channel></rss>`;
  assert.deepEqual(parseFeed(xml), [
    { guid: "g1", title: "Good", link: "https://x.test/good" },
    { guid: "g2", title: "Hostile", link: null },
    { guid: "g3", title: "Linkless", link: null },
  ]);
});

// Scheme is the gate; host is not. An article link may legitimately point at any
// https host, unlike the *fetch* path, whose origin is pinned at registration.
test("admits an https link to any host, and normalises it", () => {
  const xml = `<?xml version="1.0"?><rss version="2.0"><channel>
    <item><guid>g1</guid><link>HTTPS://Other.test/a</link></item>
  </channel></rss>`;
  assert.deepEqual(
    parseFeed(xml).map((i) => i.link),
    ["https://other.test/a"],
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
