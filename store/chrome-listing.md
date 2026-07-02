# Chrome Web Store listing copy

Paste-ready text for the CWS dashboard, one section per form field. The first
upload has to happen by hand in the dashboard (the v2 API can't create new
items), so this file is the source of truth for what goes in each box. The AMO
listing reuses the description with minor edits.

## Store listing tab

### Description

> Feedmark turns one bookmarks folder into your RSS subscription list.
>
> Create a folder called "Feedmark" in your bookmarks, drop in the sites you
> want to follow, and the toolbar button starts counting unread posts. Open the
> popup to see the latest items per site; click a site to read it, which clears
> its count. If a site doesn't advertise its feed, paste the feed URL once and
> you're subscribed.
>
> There's deliberately little to it:
>
> - No account, no server, no sync. Your subscriptions are your bookmarks;
>   everything else stays in local browser storage.
> - Feeds are fetched directly from the sites you bookmarked, over https only,
>   every 15 minutes.
> - Nothing is collected, tracked, or sent to anyone — see the privacy policy.
>
> Manage subscriptions the way you already manage bookmarks: add, rename, move
> or delete a bookmark in the folder and Feedmark follows along.

### Category

Pick in the dashboard — likely "News & weather" or whatever current category
fits an RSS reader best; the live dashboard list is the source of truth (I
could not verify current CWS category names from the docs).

## Privacy tab

### Single purpose description

> Feedmark reads the RSS/Atom feeds of sites the user has bookmarked in one
> designated bookmarks folder, and shows unread counts and item titles for
> those feeds. The bookmarks folder is the subscription list; the extension
> does nothing else.

### Permission justifications

**bookmarks**

> The bookmarks folder IS the subscription list: Feedmark locates the one
> folder the user names "Feedmark", reads the bookmarks inside it (title and
> URL), and listens for add/rename/move/remove events to keep the feed list in
> sync. It never creates, edits, or deletes bookmarks, and reads nothing
> beyond the title lookup that finds the folder and that folder's own
> children.

**storage**

> All extension state — the feed registry, unread counts, seen-item IDs, and
> HTTP caching headers — is kept in local extension storage. This is the only
> place data lives; nothing is transmitted to the developer or any third party.

**alarms**

> Feeds are polled on a fixed 15-minute schedule. Under Manifest V3 the
> background service worker is short-lived, so the alarms API is the supported
> way to schedule the poll.

**Host permission (https://\*/\*)**

> Users subscribe by bookmarking arbitrary sites (or pasting a feed URL), so
> the set of feed origins is chosen by the user and cannot be known in
> advance — any narrower match pattern would dictate which sites a user is
> allowed to follow. The permission is https-only by construction; http is
> refused. Requests go exclusively to (a) sites the user bookmarked in the
> watched folder and (b) feed URLs the user pasted — the extension has no
> content scripts, never injects into or reads pages the user visits, and
> fetches nothing except the specific feed URLs it was given.

### Remote code

Answer: **No, I am not using remote code.**

> All executable code ships in the package. Feeds are fetched as XML data,
> parsed with a bundled parser, and rendered as inert text; feed content is
> never executed or injected.

### Data usage

Google's User Data FAQ counts "website content" as user data even when it is
only stored locally, and Feedmark stores feed items (site content) in local
storage. The honest reading:

- Tick **"Website content"** as collected (feed titles/items, stored locally,
  never transmitted off the device).
- Tick nothing else — no personally identifiable information, no
  authentication, no location, no web history (Feedmark never sees browsing;
  it only fetches URLs the user explicitly gave it).
- Certify all three disclosures (no sale, no unrelated use, no
  creditworthiness use) — trivially true, since nothing leaves the device.

This is a judgment call: an argument exists that local-only handling of
user-chosen feeds collects nothing. Ticking "Website content" is the
defensible-either-way answer and costs nothing.

### Privacy policy URL

`https://jasonbirchall.codeberg.page/feedmark/privacy-policy.html`

Serve it by creating a branch named `pages` in this repo containing
`privacy-policy.html` at its root (copy of `store/privacy-policy.html`).
Codeberg Pages serves `<user>.codeberg.page/<repo>/<path>` from that branch.
Verify the URL resolves before submitting.

## Distribution tab

- Visibility: Public. Free, no in-app purchases.
- EU DSA declaration: non-trader is the natural fit for a free, unpaid,
  personal extension (the dashboard leaves the judgment to you; trader details
  would be displayed publicly).

## Assets still needed (made by hand, not in this repo)

- At least one screenshot, 1280×800 or 640×400 PNG — the popup over a browser
  window is the obvious shot.
- Small promo tile, 440×280 — one dashboard page calls it required, another
  optional-with-ranking-penalty; have one ready.
- The 128px store icon exists (`icons/feedmark-128.png`), but CWS wants 96×96
  artwork inside 16px transparent padding — check ours against that spec
  before upload.
