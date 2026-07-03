# Feedmark

Another RSS feed browser extension, but this time from a bookmarks folder.

## Why this exists

I want to know when my favourite bloggers post something new, but I don't want to keep checking their sites on the off-chance. I want my web browser to tell me when it's worth going looking.

There are plenty of good RSS reader extensions, and every one of them asks me to build and maintain a subscription list. I already have that list, it's my bookmarks. Keeping a second copy of it, in feed-URL form, sparks no joy at all.

So Feedmark is an RSS reader where the subscription list is a bookmarks folder. One folder for now (called Feedmark); maybe, one day, all bookmarks.

## How to use it

1. Install the extension using Firefox's AMO Store or Chrome's Web Store.

2. Make a folder called `Feedmark` in your bookmarks and put your favourite sites in it. (A feed
URL works too, but the point is that you don't need one.)

3. Every 15 minutes the Feedmark extension polls each site listed in this folder; the toolbar badge counts the articles you haven't read, and the popup shows a fairly simple list of their titles per site.

4. Clicking a site in the popup opens it and clears that site's count; the badge total drops with it.

5. If a site doesn't announce its feed, the popup shows a paste box — paste the feed URL once and you're subscribed.


## How it works

Most blogs announce their feed link in their HTML, and Feedmark picks that up on
its own, but only when the feed lives on the same origin as the site. A feed advertised from some other domain is not trusted automatically; the popup shows a box to paste the address by hand instead. Same box for sites that don't announce a feed at all.

Rename, move or delete a bookmark in the folder and the subscription follows. That's most of the manual.
 There's no account and no server. Feeds come straight from the sites you bookmarked, over https; everything Feedmark knows sits in your browser's extension storage. Nothing reaches me. The privacy policy is [one page](store/privacy-policy.html).

It's a v0 on purpose: an unread count and a list of titles. No OPML, no reading pane, no sync — some of that may come later, none of it is promised.

## Building

`make help` shows the development loop. [BUILDING.md](BUILDING.md) is the from-source build, it reproduces the shipped artifact byte-for-byte, which is what a store reviewer needs and also how `make verify-build` keeps us honest.

## License

[Apache-2.0](LICENSE).
