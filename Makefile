# Feedmark local dev loop. The quality gates run here, on the laptop, before
# they ever run in CI. Each target does exactly what it says.

.DEFAULT_GOAL := help
.PHONY: help install lint lint-ext audit format typecheck test build run clean icons source-package verify-build

VERSION := $(shell node -p "require('./manifest.json').version")

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "} {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

install: ## Install pinned deps without running package scripts
	npm ci --ignore-scripts

lint: ## Fail on any lint or formatting violation
	npx eslint .
	npx prettier --check .

format: ## Auto-fix formatting
	npx prettier --write .

typecheck: ## Type-check without emitting
	npx tsc --noEmit

test: ## Run the unit test suite (node:test, TS via type-stripping)
	node --test --experimental-strip-types $$(find src -name '*.test.ts')

lint-ext: build ## Lint the built extension with web-ext (mirrors CI; warnings are non-fatal)
	npx web-ext lint --source-dir=dist

audit: ## Fail on high/critical dependency advisories (mirrors CI)
	npm audit --audit-level=high

build: clean ## Bundle the extension into dist/
	npx rollup -c rollup.config.mjs
	cp manifest.json dist/
	cp src/popup.html dist/
	cp src/popup.css dist/
	cp -R icons dist/

run: build ## Load the extension in Firefox with live-reload
	npx web-ext run --source-dir=dist --devtools --start-url "about:debugging#/runtime/this-firefox"

clean: ## Remove build output
	rm -rf dist .verify-build

# git archive packs TRACKED files only, so the git-ignored private docs
# (PROJECT.md, THREAT_MODEL.md, ...) cannot leak into the reviewer package by
# construction. BUILDING.md rides inside; AMO wants this as a zip.
source-package: ## Zip the tracked source + build instructions for AMO review
	mkdir -p artifacts
	git archive --format=zip -o artifacts/feedmark-$(VERSION)-source.zip HEAD

# The AMO admin reviewer rebuilds from the source package and diffs against the
# submitted extension expecting NO differences (iter-9 gate). This target is that
# check, run locally/in CI: rebuild from a pristine archive of HEAD, diff the two
# dist trees. Extraction goes via tar, not the zip, because the CI image has no
# unzip — both archives come from the same `git archive` of HEAD, so the tree is
# identical. Run on a clean checkout: an uncommitted change to src/ would diff.
verify-build: source-package build ## Prove the build reproduces from the source package (clean checkout)
	rm -rf .verify-build
	mkdir -p .verify-build
	git archive --format=tar HEAD | tar -x -C .verify-build
	cd .verify-build && npm ci --ignore-scripts && $(MAKE) build
	diff -r dist .verify-build/dist
	@echo "verify-build: dist/ and the source-package rebuild are identical"

ICON_SIZES := 16 32 48 96 128

icons: ## Regenerate PNG icons from icons/feedmark.svg (needs rsvg-convert via `brew install librsvg`; only when the SVG changes)
	for size in $(ICON_SIZES); do \
		rsvg-convert -w $$size -h $$size icons/feedmark.svg -o icons/feedmark-$$size.png; \
	done
