# qtc-aac — website, AAC and client services for qtclient.
#
#   make setup      bun install, apps/web/.env from .env.dist, prisma generate
#   make run        dev server on :5173 (applies + watches QTCAAC_PACK when set)
#   make build      production build (applies QTCAAC_PACK when set)
#   make check      svelte-check + type check
#   make migrate    prisma migrate deploy
#   make pack-check validate QTCAAC_PACK without applying it
#   make clean      remove build output and any applied pack
SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

HERE := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
WEB := $(HERE)/apps/web
PACK_TOOL := node $(HERE)/scripts/pack.mjs
QTCAAC_PACK ?=

.PHONY: help setup build run migrate check clean install pack-apply pack-check pack-clean test

help:
	@sed -n '2,10p' $(MAKEFILE_LIST)

setup:
	@python3 "$(WEB)/tools/setup/cli.py"

pack-apply:
	@if [[ -n "$(QTCAAC_PACK)" ]]; then $(PACK_TOOL) apply "$(QTCAAC_PACK)"; else $(PACK_TOOL) clean >/dev/null; fi

pack-check:
	@test -n "$(QTCAAC_PACK)" || (echo "[pack] set QTCAAC_PACK=<dir>" && exit 1)
	@$(PACK_TOOL) check "$(QTCAAC_PACK)"

pack-clean:
	@$(PACK_TOOL) clean

build: setup pack-apply
	@cd "$(WEB)" && bunx prisma generate && bun run build

run: pack-apply
	@test -f "$(WEB)/.env" || (echo "[qtc-aac] missing apps/web/.env — run make setup" && exit 1)
	@cd "$(WEB)" && bunx prisma generate >/dev/null
	@if [[ -n "$(QTCAAC_PACK)" ]]; then \
		$(PACK_TOOL) watch "$(QTCAAC_PACK)" & trap 'kill %1 2>/dev/null' EXIT; \
		cd "$(WEB)" && bun run dev -- --host 127.0.0.1 --port 5173; \
	else \
		cd "$(WEB)" && bun run dev -- --host 127.0.0.1 --port 5173; \
	fi

migrate:
	@test -f "$(WEB)/.env" || (echo "[qtc-aac] missing apps/web/.env — run make setup" && exit 1)
	@cd "$(WEB)" && bun run migrate

check: pack-apply
	@cd "$(WEB)" && bunx prisma generate >/dev/null && bun run check

test:
	@cd "$(HERE)/packages/auth-client" && bun test
	@cd "$(WEB)" && bun test src

clean:
	@rm -rf "$(WEB)/build" "$(WEB)/.svelte-kit" 2>/dev/null || true
	@$(PACK_TOOL) clean >/dev/null

install: setup
