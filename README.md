# Feedmark

An RSS reader where the subscription list is a bookmarks folder.

Make a folder called `Feedmark` in your bookmarks and put sites in it. (A feed
URL works too, but the point is that you don't need one.) Every 15 minutes
Feedmark polls each site, the toolbar badge totals what you haven't read, and
the popup lists the newest titles per site. Clicking a site opens it and
clears its count.

Most blogs announce their feed in their HTML, and Feedmark picks that up on
its own — but only when the feed lives on the same origin as the site. A feed
advertised from some other domain is not trusted automatically; the popup
shows a box to paste the address by hand instead. Same box for sites that
don't announce a feed at all.

Rename, move or delete a bookmark in the folder and the subscription follows.
That's most of the manual.

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

## License

[Apache-2.0](LICENSE).
