#!/usr/bin/env bash
# qtc-aac runtime: wait for MariaDB + the Crystal schema, apply Prisma migrations, start.
set -euo pipefail

cd /app

# Runtime defaults from .env.dist for anything the deployment did not set.
# SvelteKit reads config through $env/dynamic/*, so this replaces the old
# build-time .env bake.
if [[ -f /app/.env.defaults ]]; then
	while IFS= read -r line || [[ -n "$line" ]]; do
		[[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue
		key="${BASH_REMATCH[1]}"
		value="${BASH_REMATCH[2]}"
		[[ "$key" == DATABASE_URL || -n "${!key+x}" ]] && continue
		if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then
			value="${BASH_REMATCH[1]}"
		fi
		export "$key=$value"
	done </app/.env.defaults
fi

MIGRATION="${QTCAAC_PRISMA_BASELINE_MIGRATION:-20261116000000_baseline}"
MIGRATION_SQL="prisma/migrations/${MIGRATION}/migration.sql"
PRISMA=(./node_modules/.bin/prisma)

if [[ ! -x "${PRISMA[0]}" ]]; then
	echo "[qtc-aac] missing prisma CLI at ${PRISMA[0]}" >&2
	exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
	echo "[qtc-aac] DATABASE_URL is required" >&2
	exit 1
fi

if [[ ! -f "$MIGRATION_SQL" ]]; then
	echo "[qtc-aac] missing $MIGRATION_SQL" >&2
	exit 1
fi

echo "[qtc-aac] waiting for database..."
for i in $(seq 1 60); do
	if node -e '
const net = require("net");
const { URL } = require("url");
const u = new URL(process.env.DATABASE_URL);
const sock = net.connect(
  { host: u.hostname, port: Number(u.port || 3306) },
  () => { sock.end(); process.exit(0); },
);
sock.on("error", () => process.exit(1));
setTimeout(() => process.exit(1), 2000);
'; then
		echo "[qtc-aac] database ready"
		break
	fi
	if [[ "$i" -eq 60 ]]; then
		echo "[qtc-aac] database not reachable (DATABASE_URL)" >&2
		exit 1
	fi
	sleep 2
done

# Crystal schema must exist before the web overlay FKs can apply.
echo "[qtc-aac] waiting for Crystal accounts table..."
for i in $(seq 1 60); do
	if "${PRISMA[@]}" db execute --stdin <<<"SELECT 1 FROM accounts LIMIT 1" >/dev/null 2>&1; then
		echo "[qtc-aac] Crystal schema present"
		break
	fi
	if [[ "$i" -eq 60 ]]; then
		echo "[qtc-aac] Crystal accounts table missing — start the game server once so schema.sql is imported" >&2
		exit 1
	fi
	sleep 2
done

apply_overlay_and_mark_applied() {
	echo "[qtc-aac] applying overlay SQL + marking ${MIGRATION} applied"
	"${PRISMA[@]}" db execute --file "$MIGRATION_SQL"
	"${PRISMA[@]}" migrate resolve --applied "$MIGRATION"
}

echo "[qtc-aac] applying prisma migrations..."
set +e
migrate_out="$("${PRISMA[@]}" migrate deploy 2>&1)"
migrate_code=$?
set -e

if [[ "$migrate_code" -ne 0 ]]; then
	if echo "$migrate_out" | grep -q "P3009"; then
		# Prior boot left a failed row in _prisma_migrations; overlay SQL is idempotent.
		echo "[qtc-aac] clearing failed migration record (P3009)"
		echo "$migrate_out"
		"${PRISMA[@]}" migrate resolve --rolled-back "$MIGRATION"
		apply_overlay_and_mark_applied
	elif echo "$migrate_out" | grep -q "P3005"; then
		echo "[qtc-aac] baselining prisma on existing Crystal schema (P3005)"
		apply_overlay_and_mark_applied
	else
		echo "$migrate_out" >&2
		exit "$migrate_code"
	fi
else
	echo "$migrate_out"
fi

# Catch any remaining pending migrations after resolve paths.
"${PRISMA[@]}" migrate deploy

echo "[qtc-aac] starting"
exec node build
