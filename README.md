# Feedmark

An RSS reader where the subscription list is a bookmarks folder.

Pick a folder to watch — the popup will ask on first run, or it's in the
extension's options — and put sites in it. Plain bookmarks are enough: the
site's homepage, not a feed URL. (A feed URL works too, but the point is that
you don't need one.) Every 15 minutes Feedmark polls each site, and the
toolbar badge counts what you haven't read.

## Reading

The popup shows one row per site with its unread count. Click the row and it
folds open to the ten newest unread titles; click a title and the article
opens in a new tab, marked read — it leaves the list, an older unread item
takes its place, and the counts drop. At the end of the list there's a quiet
"Mark all read" for when a site arrives with thirty unread posts you're never
going to get to.

Nothing greys out and there's no archive: read items just leave, and the
badge is always exactly the number of titles still waiting. If the badge says
zero, you're done.

## Finding feeds

Most blogs announce their feed in their HTML, and Feedmark picks that up on
its own — but only when the feed lives on the same origin as the site. A feed
advertised from some other domain is never trusted automatically; the popup
shows a box to paste the address by hand instead. Same box for sites that
don't announce a feed at all. Either way it's https or nothing — plain http
is refused outright.

## Everything is a bookmark

Rename, move or delete a bookmark in the folder and the subscription follows;
there is no separate list to keep in sync. The watched folder itself is
tracked by identity rather than name, so renaming it changes nothing. Even
deleting it destroys nothing: Feedmark keeps what you've read on record and
asks you to choose a folder again. That's most of the manual.

## Privacy

There's no account and no server. Feeds come straight from the sites you
bookmarked, over https; everything Feedmark knows sits in your browser's
extension storage. Nothing reaches me. The privacy policy is
[one page](store/privacy-policy.html).

It's a v0 on purpose: an unread count and a list of titles. No OPML, no
reading pane, no sync — some of that may come later, none of it is promised.

## Building

`make help` shows the development loop. [BUILDING.md](BUILDING.md) is the
from-source build — it reproduces the shipped artifact byte-for-byte, which is
what a store reviewer needs and also how `make verify-build` keeps us honest.

## Releasing

A release is a signed tag; pushing it is the deploy.

```
git commit -m "Bump to version 0.2.0"   # manifest.json is the single source of truth
git push origin main                    # CI runs the same gates as the local make loop
git tag -s v0.2.0 -m "Feedmark 0.2.0"
git tag -v v0.2.0                       # verify the signature before it leaves the laptop
git push origin v0.2.0                  # triggers the AMO publish
```

The tag must match the manifest version exactly — the release job refuses
anything else — and the job re-proves the reproducible build before uploading
to AMO with the source package attached. The Chrome Web Store is manual for
now: `make chrome-package`, then upload the zip it drops in `artifacts/`
through the developer dashboard.

## License

[Apache-2.0](LICENSE).
