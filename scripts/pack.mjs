#!/usr/bin/env node
// qtc-aac product pack tool.
//
//   node scripts/pack.mjs apply <packDir>   copy pack into apps/web (idempotent)
//   node scripts/pack.mjs watch <packDir>   apply, then re-apply on change (dev)
//   node scripts/pack.mjs clean             remove everything a pack applied
//   node scripts/pack.mjs check <packDir>   validate the pack layout only
//
// <packDir> defaults to $QTCAAC_PACK. A pack is a directory with `web/`:
//
//   web/lib/{config,hooks.server,play.client}.ts   -> apps/web/src/lib/pack/
//   web/routes/**                                  -> apps/web/src/routes/(app)/(pack)/  (site layout)
//   web/static/**                                  -> apps/web/static/pack/   (served at /pack/…)
//   web/content/*                                  -> apps/web/content/pack/
//   web/prisma/schema/*.prisma                     -> apps/web/prisma/schema/pack/
//   web/prisma/migrations/<ts>_pack_<name>/        -> apps/web/prisma/migrations/
//
// Anything else under web/ is rejected so packs cannot fork core files.
import {
	cpSync,
	existsSync,
	mkdirSync,
	readdirSync,
	rmSync,
	statSync,
	watch,
	writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB = join(ROOT, 'apps/web');

const DIRS = {
	lib: 'src/lib/pack',
	routes: 'src/routes/(app)/(pack)',
	static: 'static/pack',
	content: 'content/pack',
};
const PRISMA_SCHEMA = 'prisma/schema/pack';
const MIGRATIONS = 'prisma/migrations';
const MIGRATION_RE = /^\d{14}_pack_[a-z0-9_]+$/;
const LIB_MODULES = new Set(['config.ts', 'hooks.server.ts', 'play.client.ts']);
const ALLOWED_TOP = new Set([...Object.keys(DIRS), 'prisma']);

function die(msg) {
	console.error(`[pack] ${msg}`);
	process.exit(1);
}

function packDirFrom(arg) {
	const dir = arg || process.env.QTCAAC_PACK;
	if (!dir) die('no pack directory (argument or QTCAAC_PACK)');
	const abs = resolve(process.cwd(), dir);
	if (!existsSync(join(abs, 'web'))) die(`${abs} has no web/ directory`);
	return abs;
}

function check(pack) {
	const web = join(pack, 'web');
	const errors = [];
	for (const name of readdirSync(web)) {
		if (name.startsWith('.')) continue;
		if (!ALLOWED_TOP.has(name)) errors.push(`web/${name} is not a pack surface`);
	}
	const lib = join(web, 'lib');
	if (existsSync(lib)) {
		for (const name of readdirSync(lib)) {
			const st = statSync(join(lib, name));
			// Helper modules for the three entry points live in subdirectories.
			if (st.isFile() && !LIB_MODULES.has(name)) {
				errors.push(`web/lib/${name}: top-level lib files must be one of ${[...LIB_MODULES].join(', ')}`);
			}
		}
	}
	const prisma = join(web, 'prisma');
	if (existsSync(prisma)) {
		for (const name of readdirSync(prisma)) {
			if (name !== 'schema' && name !== 'migrations') errors.push(`web/prisma/${name} is not allowed`);
		}
		const migs = join(prisma, 'migrations');
		if (existsSync(migs)) {
			for (const name of readdirSync(migs)) {
				if (name.startsWith('.')) continue;
				if (!MIGRATION_RE.test(name)) {
					errors.push(`web/prisma/migrations/${name}: name must match <14-digit ts>_pack_<name>`);
				}
			}
		}
	}
	if (errors.length) die(`invalid pack ${pack}:\n  ${errors.join('\n  ')}`);
	return web;
}

function clean() {
	for (const rel of [...Object.values(DIRS), PRISMA_SCHEMA]) {
		rmSync(join(WEB, rel), { recursive: true, force: true });
	}
	const migs = join(WEB, MIGRATIONS);
	if (existsSync(migs)) {
		for (const name of readdirSync(migs)) {
			if (MIGRATION_RE.test(name)) rmSync(join(migs, name), { recursive: true, force: true });
		}
	}
	rmSync(join(WEB, '.pack-applied'), { force: true });
}

function apply(pack) {
	const web = check(pack);
	clean();
	for (const [key, rel] of Object.entries(DIRS)) {
		const src = join(web, key);
		if (existsSync(src)) cpSync(src, join(WEB, rel), { recursive: true });
	}
	const schema = join(web, 'prisma/schema');
	if (existsSync(schema)) cpSync(schema, join(WEB, PRISMA_SCHEMA), { recursive: true });
	const migs = join(web, 'prisma/migrations');
	if (existsSync(migs)) {
		for (const name of readdirSync(migs)) {
			if (MIGRATION_RE.test(name)) {
				cpSync(join(migs, name), join(WEB, MIGRATIONS, name), { recursive: true });
			}
		}
	}
	mkdirSync(WEB, { recursive: true });
	writeFileSync(join(WEB, '.pack-applied'), `${pack}\n`);
	console.log(`[pack] applied ${relative(process.cwd(), pack) || pack}`);
}

function watchPack(pack) {
	apply(pack);
	let timer = null;
	watch(join(pack, 'web'), { recursive: true }, () => {
		clearTimeout(timer);
		timer = setTimeout(() => {
			try {
				apply(pack);
			} catch (err) {
				console.error('[pack] re-apply failed', err);
			}
		}, 150);
	});
	console.log('[pack] watching for changes');
}

const [cmd, arg] = process.argv.slice(2);
switch (cmd) {
	case 'apply':
		apply(packDirFrom(arg));
		break;
	case 'watch':
		watchPack(packDirFrom(arg));
		break;
	case 'check':
		check(packDirFrom(arg));
		console.log('[pack] ok');
		break;
	case 'clean':
		clean();
		console.log('[pack] cleaned');
		break;
	default:
		die('usage: pack.mjs apply|watch|check|clean [packDir]');
}
