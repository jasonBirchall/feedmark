import { test } from "node:test";
import assert from "node:assert/strict";
import { discoverFeedUrl } from "./discover.ts";

const PAGE = "https://site.test/blog/";

test("a same-origin advertised feed is discovered", () => {
  const html = `<head><link rel="alternate" type="application/rss+xml" href="https://site.test/feed.xml"></head>`;
  assert.deepEqual(discoverFeedUrl(html, PAGE), {
    kind: "found",
    url: "https://site.test/feed.xml",
  });
});

test("a root-relative href resolves to the page origin", () => {
  const html = `<link type="application/atom+xml" href="/atom.xml">`;
  assert.deepEqual(discoverFeedUrl(html, PAGE), {
    kind: "found",
    url: "https://site.test/atom.xml",
  });
});

test("a document-relative href resolves against the page path", () => {
  const html = `<link type="application/rss+xml" href="feed">`;
  assert.deepEqual(discoverFeedUrl(html, PAGE), {
    kind: "found",
    url: "https://site.test/blog/feed",
  });
});

// The gate. A page advertising ONLY a cross-origin feed must not be auto-trusted.
test("a cross-origin-only advertised feed is rejected (the gate)", () => {
  const html = `<link rel="alternate" type="application/rss+xml" href="https://feeds.evil.test/x.xml">`;
  assert.deepEqual(discoverFeedUrl(html, PAGE), {
    kind: "none",
    reason: "cross-origin-only",
  });
});

test("with both cross-origin and same-origin feeds, the same-origin one wins", () => {
  const html = `
    <link type="application/rss+xml" href="https://feeds.evil.test/x.xml">
    <link type="application/atom+xml" href="https://site.test/feed.atom">`;
  assert.deepEqual(discoverFeedUrl(html, PAGE), {
    kind: "found",
    url: "https://site.test/feed.atom",
  });
});

test("a same-host http link is a different origin and is rejected", () => {
  const html = `<link type="application/rss+xml" href="http://site.test/feed.xml">`;
  assert.deepEqual(discoverFeedUrl(html, PAGE), {
    kind: "none",
    reason: "cross-origin-only",
  });
});

test("a hostile <base href> cannot redirect discovery off-origin", () => {
  // We deliberately ignore <base> and resolve against the real page URL, so the
  // relative href stays on the legitimate origin.
  const html = `
    <base href="https://feeds.evil.test/">
    <link type="application/rss+xml" href="/feed.xml">`;
  assert.deepEqual(discoverFeedUrl(html, PAGE), {
    kind: "found",
    url: "https://site.test/feed.xml",
  });
});

test("a page with no feed link reports no-feed-link", () => {
  const html = `<head><link rel="stylesheet" href="/site.css"><title>Blog</title></head>`;
  assert.deepEqual(discoverFeedUrl(html, PAGE), {
    kind: "none",
    reason: "no-feed-link",
  });
});

test("an empty body reports no-feed-link", () => {
  assert.deepEqual(discoverFeedUrl("", PAGE), { kind: "none", reason: "no-feed-link" });
});

test("attribute order and single quotes are tolerated", () => {
  const html = `<link href='/feed.xml' type='application/rss+xml' rel='alternate'>`;
  assert.deepEqual(discoverFeedUrl(html, PAGE), {
    kind: "found",
    url: "https://site.test/feed.xml",
  });
});

test("a charset suffix on the type is tolerated", () => {
  const html = `<link type="application/rss+xml; charset=utf-8" href="/feed.xml">`;
  assert.deepEqual(discoverFeedUrl(html, PAGE), {
    kind: "found",
    url: "https://site.test/feed.xml",
  });
});

test("a protocol-relative href to another host is rejected", () => {
  // `//host/path` inherits the page scheme but points off-origin — still cross-origin.
  const html = `<link type="application/rss+xml" href="//feeds.evil.test/x.xml">`;
  assert.deepEqual(discoverFeedUrl(html, PAGE), {
    kind: "none",
    reason: "cross-origin-only",
  });
});

test("a non-feed link type is ignored", () => {
  const html = `<link rel="icon" type="image/png" href="/favicon.png">`;
  assert.deepEqual(discoverFeedUrl(html, PAGE), {
    kind: "none",
    reason: "no-feed-link",
  });
});
