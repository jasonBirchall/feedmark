# Feedmark local dev loop. The quality gates run here, on the laptop, before
# they ever run in CI. Each target does exactly what it says.

.DEFAULT_GOAL := help
.PHONY: help install lint lint-ext audit format typecheck test build run clean icons

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
	cp -R icons dist/

run: build ## Load the extension in Firefox with live-reload
	npx web-ext run --source-dir=dist --devtools --start-url "about:debugging#/runtime/this-firefox"

clean: ## Remove build output
	rm -rf dist

ICON_SIZES := 16 32 48 96 128

icons: ## Regenerate PNG icons from icons/feedmark.svg (needs rsvg-convert via `brew install librsvg`; only when the SVG changes)
	for size in $(ICON_SIZES); do \
		rsvg-convert -w $$size -h $$size icons/feedmark.svg -o icons/feedmark-$$size.png; \
	done
