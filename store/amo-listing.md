# AMO listing & submission notes

The Firefox side of shipping: what CI submits on its own, what gets typed into
the Developer Hub afterwards, and the order to do your part in. The Chrome
copy lives in `chrome-listing.md`; the AMO description is the same text.

## What CI submits automatically

A `v*` tag push runs `web-ext sign`, which carries two things beyond the
extension itself:

- `amo-metadata.json` — categories, summary, license, and a reviewer note
  (`version.approval_notes`, visible only to Mozilla) explaining the
  data-collection declaration and the wildcard host permission.
- The source package (`--upload-source-code`), with `BUILDING.md` inside.
  Required because the extension is bundled; the reviewer rebuilds from it and
  diffs against the submitted file.

## Typed into the Developer Hub after first submission

- **Description** — same text as `chrome-listing.md` §Description.
- **Support site** — the Codeberg repo. Support email: your call.
- **Privacy policy** — AMO only demands one when an extension transmits data,
  and Feedmark doesn't. Linking the Codeberg Pages policy anyway costs nothing
  and matches the Chrome listing.

## Your checklist, in order

1. Mozilla account, then the mandatory 2FA. TOTP only — AMO doesn't support
   WebAuthn, so the YubiKey helps here via its authenticator applet, not its
   touch flow.
2. Generate the API key pair at
   <https://addons.mozilla.org/developers/addon/api/key/> and store it as the
   repo secrets `AMO_API_KEY` / `AMO_API_SECRET`.
3. Protect the `v*` tag pattern (repo Settings → Tags).
4. Bump the `manifest.json` version, commit, tag `vX.Y.Z`, push the tag.
5. Watch the Release workflow, then fill in the Developer Hub fields above.

Signing normally completes within 24 hours. Source-code submissions go to a
smaller admin-reviewer pool and can sit longer; there's no published SLA, and
resubmitting doesn't hurry it.
