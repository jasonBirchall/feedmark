import { MAX_BODY_BYTES, FETCH_TIMEOUT_MS } from "./config.ts";

export type FetchResult =
  | {
      kind: "ok";
      body: string;
      etag: string | null;
      lastModified: string | null;
    }
  | { kind: "notModified" }
  | { kind: "failed"; reason: string };

type FetchInput = {
  url: string;
  origin: string;
  etag: string | null;
  lastModified: string | null;
};

type FetchOpts = {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
};

export async function fetchFeed(feed: FetchInput, opts: FetchOpts = {}): Promise<FetchResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? FETCH_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? MAX_BODY_BYTES;

  let parsed: URL;
  try {
    parsed = new URL(feed.url);
  } catch {
    return { kind: "failed", reason: "bad-url" };
  }
  if (parsed.protocol !== "https:") {
    return { kind: "failed", reason: "not-https" };
  }

  const headers: Record<string, string> = {};
  if (feed.etag) headers["If-None-Match"] = feed.etag;
  if (feed.lastModified) headers["If-Modified-Since"] = feed.lastModified;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await doFetch(feed.url, {
      method: "GET",
      headers,
      redirect: "manual",
      signal: controller.signal,
    });

    // 304 lives in the 3xx range but is not a redirect — handle it first.
    if (res.status === 304) return { kind: "notModified" };
    if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
      return { kind: "failed", reason: "redirect" };
    }
    if (!res.ok) return { kind: "failed", reason: `status-${res.status}` };

    if (res.url && new URL(res.url).origin !== feed.origin) {
      return { kind: "failed", reason: "origin-mismatch" };
    }

    const body = await readBounded(res, maxBytes);
    if (body === null) return { kind: "failed", reason: "too-large" };

    return {
      kind: "ok",
      body,
      etag: res.headers.get("ETag"),
      lastModified: res.headers.get("Last-Modified"),
    };
  } catch {
    return {
      kind: "failed",
      reason: controller.signal.aborted ? "timeout" : "network",
    };
  } finally {
    clearTimeout(timer);
  }
}

// Stream the body and abort once the cap is exceeded, rather than buffering an
// attacker-chosen size. The parser still needs the whole string; this bounds it.
async function readBounded(res: Response, maxBytes: number): Promise<string | null> {
  const reader = res.body?.getReader();
  if (!reader) {
    const text = await res.text();
    return new TextEncoder().encode(text).byteLength > maxBytes ? null : text;
  }
  const decoder = new TextDecoder("utf-8");
  let out = "";
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      out += decoder.decode(value, { stream: true });
    }
  }
  out += decoder.decode();
  return out;
}
