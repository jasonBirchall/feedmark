# Building Feedmark from source

Feedmark is written in TypeScript and bundled with rollup, so the extension
submitted to the store is built, not hand-authored. Following these steps
reproduces the submitted extension exactly: unpack the store artifact and
`diff -r` it against `dist/` — there must be no differences.

## Environment

- **OS:** any Linux or macOS. Release artifacts are built in CI inside the
  `node:22-bookworm` Docker image (Debian 12).
- **Node.js 22 (LTS)** — https://nodejs.org/. npm ships with Node; no other
  package manager is used.
- **GNU Make** (present by default on the systems above).

All build tools and dependencies are open-source npm packages, installed from
the public npm registry at the exact versions pinned in the committed
`package-lock.json`. Package install scripts are disabled throughout.

## Build

```
npm ci --ignore-scripts
make build
```

The finished extension is the `dist/` directory — the exact tree that is
zipped and submitted to the store. The `.js.map` sourcemaps are part of the
build output and are included deliberately.

## Verifying reproducibility

```
make verify-build
```

On a clean checkout, this rebuilds the extension from a pristine archive of
the tracked source and fails on any difference from a direct build.
