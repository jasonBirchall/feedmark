# Chrome Web Store listing copy

Paste-ready text for the CWS dashboard — what goes in each box, and nothing
else. The AMO listing reuses the description.

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

### Privacy policy URL

`https://jasonbirchall.codeberg.page/feedmark/privacy-policy.html`
