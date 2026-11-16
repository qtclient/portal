# syntax=docker/dockerfile:1.7
# qtc-aac website image (workspace root context, `-f apps/web/Dockerfile`).
#
#   docker build -f apps/web/Dockerfile .                              # core
#   docker build -f apps/web/Dockerfile --build-context pack=../my-pack .   # + product pack
#
# Config is runtime-only ($env/dynamic/*), so the image carries no secrets.
# Public assets (WASM tip, store images, outfits, items) come from
# QTCAAC_ASSET_BASE (a qtclient CDN tip).
#
# Native deps (@napi-rs/canvas, bcrypt) are N-API prebuilds, so the runtime
# stage reuses the build stage's node_modules without system libraries.

# Empty unless `--build-context pack=<dir>` overrides this stage.
FROM scratch AS pack

FROM node:24-bookworm-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends \
	ca-certificates \
	curl \
	unzip \
	&& apt-get clean && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash
ENV BUN_INSTALL=/root/.bun \
	PATH=/root/.bun/bin:$PATH

WORKDIR /repo

# Every workspace manifest must be present for a frozen install.
COPY package.json bun.lock bunfig.toml ./
COPY apps/web/package.json apps/web/
COPY packages/ packages/
RUN bun install --frozen-lockfile --filter @qtc-aac/web

COPY . ./
COPY --from=pack / /pack/
RUN if [ -d /pack/web ]; then node scripts/pack.mjs apply /pack; fi

WORKDIR /repo/apps/web

RUN bunx prisma generate \
	&& bun run build

FROM node:24-bookworm-slim AS runtime

ARG TARGETARCH
# rust-minidump `minidump-stackwalk` for crash symbolication (x86_64 only;
# other arches run without it and mark desktop crash reports `failed`).
ARG STACKWALK_VERSION=v0.27.0
ARG STACKWALK_SHA256=0020324c54cc359596e927ee907204f4c8d4da6718765536edcabaa1622122ad

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
	ca-certificates \
	curl \
	openssl \
	xz-utils \
	&& if [ "$TARGETARCH" = "amd64" ] || [ -z "$TARGETARCH" ]; then \
		f=minidump-stackwalk-x86_64-unknown-linux-gnu; \
		curl -fsSL -o /tmp/sw.tar.xz "https://github.com/rust-minidump/rust-minidump/releases/download/${STACKWALK_VERSION}/${f}.tar.xz" \
		&& echo "${STACKWALK_SHA256}  /tmp/sw.tar.xz" | sha256sum -c - \
		&& tar -xJf /tmp/sw.tar.xz -C /tmp \
		&& install -m 0755 "/tmp/${f}/minidump-stackwalk" /usr/local/bin/minidump-stackwalk \
		&& rm -rf /tmp/sw.tar.xz "/tmp/${f}"; \
	fi \
	&& apt-get purge -y curl xz-utils && apt-get autoremove -y \
	&& apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=build /repo/apps/web/build ./build
COPY --from=build /repo/apps/web/package.json ./package.json
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/web/prisma ./prisma
COPY --from=build /repo/apps/web/prisma.config.ts ./prisma.config.ts
COPY --from=build /repo/apps/web/static ./static
COPY --from=build /repo/apps/web/content ./content
COPY apps/web/.env.dist /app/.env.defaults
COPY apps/web/deploy/entrypoint.sh /app/entrypoint.sh

# outfits_anim/ and items/ are caches filled on demand from the CDN
# assets/{outfits,items} slices; data/telemetry holds dumps + symbols (mount a volume).
RUN mkdir -p /app/outfits_anim /app/items /app/data/telemetry \
	&& chmod +x /app/entrypoint.sh

# BODY_SIZE_LIMIT: adapter-node body cap. Minidumps and .sym uploads exceed the
# 512K default; the telemetry endpoints enforce QTCAAC_CRASH_MAX_BYTES /
# QTCAAC_SYMBOL_MAX_BYTES themselves.
ENV NODE_ENV=production \
	PRISMA_HIDE_UPDATE_MESSAGE=1 \
	PORT=3000 \
	HOST=0.0.0.0 \
	BODY_SIZE_LIMIT=600M \
	QTCAAC_CRYSTAL_WEBSOCKET_PORT=7174 \
	QTCAAC_TELEMETRY_DIR=/app/data/telemetry \
	ALLOW_LEGACY_SHA1_PASSWORDS=true \
	DEPRECATED_USE_SHA1_PASSWORDS=true \
	STATUS_PORT=7171 \
	SERVER_PORT=7172

VOLUME ["/app/data"]
EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
