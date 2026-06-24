# Feedmark local dev loop. The quality gates run here, on the laptop, before
# they ever run in CI. Each target does exactly what it says.

.DEFAULT_GOAL := help
.PHONY: help install lint format typecheck build run clean

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

build: clean ## Bundle the extension into dist/
	npx rollup -c rollup.config.mjs
	cp manifest.json dist/

run: build ## Load the extension in Firefox with live-reload
	npx web-ext run --source-dir=dist --devtools --start-url "about:debugging#/runtime/this-firefox"

clean: ## Remove build output
	rm -rf dist
