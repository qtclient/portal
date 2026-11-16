/**
 * OTC / CIP clientservices payloads (cacheinfo, eventschedule, showoff,
 * boostedcreature, news).
 *
 * Events come from QTCAAC_EVENTS_JSON (default: content/events.json, or the
 * pack's content/pack/events.json). News: QTCAAC_NEWS_JSON override, else
 * published News rows, else content/news.json defaults (pack first).
 */
import Markdoc from '@markdoc/markdoc';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

import { PlayerGroup } from '#lib/players.js';
import { contentPath } from '#lib/server/content.js';
import { fromMonorepo } from '#lib/server/monorepo.js';
import { prisma } from '#lib/server/prisma.js';

export type OtcEventListItem = {
	name: string;
	startdate: number;
	enddate: number;
	colorlight: string;
	colordark: string;
	description: string;
	displaypriority: number;
	isseasonal: boolean | number;
	specialevent: boolean | number;
};

type CrystalEventJson = {
	name?: string;
	startdate?: string;
	enddate?: string;
	starthour?: string;
	endhour?: string;
	hour?: string;
	description?: string | { description?: string };
	colors?: { colorlight?: string; colordark?: string };
	details?: {
		displaypriority?: number;
		isseasonal?: number | boolean;
		specialevent?: number | boolean;
	};
};

function resolveEventsJsonPath(): string {
	const fromEnv = process.env.QTCAAC_EVENTS_JSON?.trim();
	if (fromEnv) {
		return resolve(fromEnv);
	}
	return contentPath('events.json');
}

function localEventsJsonCandidates(): string[] {
	return [
		contentPath('events.json'),
		fromMonorepo('data/crystalserver/data/json/eventscheduler/events.json'),
		fromMonorepo('apps/crystalserver/data/json/eventscheduler/events.json'),
	].filter((c): c is string => !!c);
}

/** Parse Crystal `M/D/YYYY` (+ optional HH:MM) into unix seconds. */
function parseCrystalDateTime(
	dateStr: string,
	hourStr: string | undefined,
	endOfDay: boolean,
): number | null {
	const parts = dateStr
		.trim()
		.split('/')
		.map((p) => Number(p));
	if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
		return null;
	}
	const [month, day, year] = parts;
	let hours = endOfDay ? 23 : 0;
	let minutes = endOfDay ? 59 : 0;
	let seconds = endOfDay ? 59 : 0;
	if (hourStr && hourStr.trim()) {
		const hp = hourStr
			.trim()
			.split(':')
			.map((p) => Number(p));
		if (hp.length >= 2 && hp.every((n) => Number.isFinite(n))) {
			hours = hp[0] ?? hours;
			minutes = hp[1] ?? minutes;
			seconds = hp[2] ?? (endOfDay ? 59 : 0);
		}
	}
	const ms = new Date(year, month - 1, day, hours, minutes, seconds).getTime();
	if (!Number.isFinite(ms)) {
		return null;
	}
	return Math.floor(ms / 1000);
}

function eventDescription(raw: CrystalEventJson['description']): string {
	if (typeof raw === 'string') {
		return raw;
	}
	if (raw && typeof raw === 'object' && typeof raw.description === 'string') {
		return raw.description;
	}
	return '';
}

export async function buildEventSchedule(): Promise<{
	lastupdatetimestamp: number;
	eventlist: OtcEventListItem[];
}> {
	const path = resolveEventsJsonPath();
	const candidates = [path, ...localEventsJsonCandidates()];

	let raw: string | null = null;
	for (const candidate of candidates) {
		try {
			raw = await readFile(candidate, 'utf8');
			break;
		} catch {
			// try next
		}
	}

	const eventlist: OtcEventListItem[] = [];
	if (raw) {
		try {
			const parsed = JSON.parse(raw) as { events?: CrystalEventJson[] };
			for (const event of parsed.events ?? []) {
				if (!event.startdate || !event.enddate || !event.name) {
					continue;
				}
				const defaultHour =
					typeof event.hour === 'string' ? event.hour : undefined;
				const startHour =
					typeof event.starthour === 'string' ? event.starthour : defaultHour;
				const endHour =
					typeof event.endhour === 'string' ? event.endhour : defaultHour;
				const startdate = parseCrystalDateTime(
					event.startdate,
					startHour,
					false,
				);
				const enddate = parseCrystalDateTime(
					event.enddate,
					endHour ?? '23:59:59',
					true,
				);
				if (startdate == null || enddate == null || enddate < startdate) {
					continue;
				}
				eventlist.push({
					name: event.name,
					startdate,
					enddate,
					colorlight: event.colors?.colorlight ?? '#3d5a73',
					colordark: event.colors?.colordark ?? '#2b3e50',
					description: eventDescription(event.description),
					displaypriority: Number(event.details?.displaypriority ?? 5),
					isseasonal: event.details?.isseasonal ?? 0,
					specialevent: event.details?.specialevent ?? 0,
				});
			}
		} catch (err) {
			console.warn('[otcStatus] failed to parse events.json', err);
		}
	}

	return {
		lastupdatetimestamp: Math.floor(Date.now() / 1000),
		eventlist,
	};
}

export async function buildCacheInfo() {
	let playersonline = 0;
	try {
		playersonline = await prisma.playerOnline.count({
			where: { player: { group_id: { lt: PlayerGroup.Gamemaster } } },
		});
	} catch {
		// Table missing / DB down — still return a valid OTC payload.
	}
	return {
		playersonline,
		discord_online: 0,
		discord_link: process.env.PUBLIC_DISCORD_URL ?? '',
		youtube_link: process.env.PUBLIC_YOUTUBE_URL ?? '',
		twitchstreams: 0,
		twitchviewer: 0,
		gamingyoutubestreams: 0,
		gamingyoutubeviewer: 0,
	};
}

function raceIdFrom(row: { raceid: string | null } | null): number {
	if (!row?.raceid) {
		return 0;
	}
	const n = Number(row.raceid);
	return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

export async function buildBoostedCreature() {
	let creature: {
		raceid: string;
		boostname: string | null;
		looktype: number;
		lookhead: number;
		lookbody: number;
		looklegs: number;
		lookfeet: number;
		lookaddons: number;
		lookmount: number | null;
	} | null = null;
	let boss: {
		raceid: string;
		boostname: string | null;
		looktype: number;
	} | null = null;

	try {
		creature = await prisma.boostedCreature.findFirst({
			select: {
				raceid: true,
				boostname: true,
				looktype: true,
				lookhead: true,
				lookbody: true,
				looklegs: true,
				lookfeet: true,
				lookaddons: true,
				lookmount: true,
			},
		});
	} catch {
		creature = null;
	}
	try {
		boss = await prisma.boostedBoss.findFirst({
			select: {
				raceid: true,
				boostname: true,
				looktype: true,
			},
		});
	} catch {
		boss = null;
	}

	const creatureraceid = raceIdFrom(creature);
	const bossraceid = raceIdFrom(boss);

	return {
		boostedcreature: true,
		creatureraceid,
		raceid: creatureraceid,
		bossraceid,
		boostname: creature?.boostname ?? '',
		bossname: boss?.boostname ?? '',
		creature:
			creatureraceid > 0
				? {
						type: creatureraceid,
						looktype: creature?.looktype ?? 0,
						lookhead: creature?.lookhead ?? 0,
						lookbody: creature?.lookbody ?? 0,
						looklegs: creature?.looklegs ?? 0,
						lookfeet: creature?.lookfeet ?? 0,
						lookaddons: creature?.lookaddons ?? 0,
						lookmount: creature?.lookmount ?? 0,
					}
				: undefined,
		boss:
			bossraceid > 0
				? {
						type: bossraceid,
						looktype: boss?.looktype ?? 0,
					}
				: undefined,
	};
}

export function buildShowOff() {
	return {
		image: process.env.QTCAAC_SHOWOFF_IMAGE ?? '',
		// OTC client_bottommenu.setShowOffData reads title / description
		title:
			process.env.QTCAAC_SHOWOFF_TITLE ?? process.env.PUBLIC_TITLE ?? 'qtc-aac',
		description: process.env.QTCAAC_SHOWOFF_DESCRIPTION ?? '',
		// Keep legacy keys for older scrapers
		titletext:
			process.env.QTCAAC_SHOWOFF_TITLE ?? process.env.PUBLIC_TITLE ?? 'qtc-aac',
		subtitletext: process.env.QTCAAC_SHOWOFF_DESCRIPTION ?? '',
	};
}

/**
 * CIP `type=news` payload for TNewsRequestUploader / TNewsStorage (compendium).
 *
 * Shape recovered from CIP client strings + live clientservices samples
 * (cache/compendium / ws_login `case 'news'`):
 *   {
 *     categorycounts: { "GAME CONTENTS": n, "CLIENT FEATURES": n, … },
 *     gamenews: Array<{
 *       id, index, category, headline, message, publishdate,
 *       type: "REGULAR"|"RETURNER"|"GROUP HEADER",
 *       campaignid?, groupheaderid?, unlocklevel?, isread?,
 *       datefrom?, dateto?, specialevent?
 *     }>,
 *     maxeditdate, idOfNewestReadEntry?, isreturner?, showrewardnews?,
 *     gamenewstodelete?
 *   }
 * Categories: MAJOR UPDATES | GAME CONTENTS | PLAYER GUIDE | CLIENT FEATURES |
 * USEFUL INFO | SUPPORT. Override via QTCAAC_NEWS_JSON (inline JSON or path):
 * full CIP object, `{ gamenews|newsitems: […] }`, or a flat item array.
 */
export const CIP_NEWS_CATEGORIES = [
	'MAJOR UPDATES',
	'GAME CONTENTS',
	'PLAYER GUIDE',
	'CLIENT FEATURES',
	'USEFUL INFO',
	'SUPPORT',
] as const;

export type CipNewsCategory = (typeof CIP_NEWS_CATEGORIES)[number];
export type CipNewsType = 'REGULAR' | 'RETURNER' | 'GROUP HEADER';

export type CipGameNewsEntry = {
	id: number;
	index: number;
	category: string;
	headline: string;
	message: string;
	publishdate: number;
	type: CipNewsType;
	campaignid?: number;
	groupheaderid?: number;
	unlocklevel?: number;
	isread?: boolean;
	datefrom?: number;
	dateto?: number;
	specialevent?: number;
};

/** Legacy flat item (pre-tree); still accepted as QTCAAC_NEWS_JSON input. */
export type OtcNewsItem = {
	id: number;
	date: number;
	title: string;
	body?: string;
	category?: string;
};

export type CipNewsResponse = {
	categorycounts: Record<string, number>;
	gamenews: CipGameNewsEntry[];
	maxeditdate: number;
	idOfNewestReadEntry: number;
	isreturner: boolean;
	showrewardnews: boolean;
	gamenewstodelete: number[];
	/** Flat alias for older scrapers / tests; mirrors gamenews. */
	newsitems: OtcNewsItem[];
};

function asFiniteInt(raw: unknown, fallback: number): number {
	if (typeof raw === 'number' && Number.isFinite(raw)) {
		return Math.trunc(raw);
	}
	if (typeof raw === 'string' && raw.trim()) {
		const n = Number(raw);
		if (Number.isFinite(n)) {
			return Math.trunc(n);
		}
	}
	return fallback;
}

function normalizeCategory(raw: unknown): string {
	if (typeof raw !== 'string' || !raw.trim()) {
		return 'USEFUL INFO';
	}
	const upper = raw.trim().toUpperCase();
	const aliases: Record<string, string> = {
		'MAJOR UPDATE': 'MAJOR UPDATES',
		UPDATE: 'MAJOR UPDATES',
		CLIENT: 'CLIENT FEATURES',
		'CLIENT FEATURE': 'CLIENT FEATURES',
		GAME: 'GAME CONTENTS',
		'GAME CONTENT': 'GAME CONTENTS',
		GUIDE: 'PLAYER GUIDE',
		PLAYERGUIDE: 'PLAYER GUIDE',
		USEFUL: 'USEFUL INFO',
		INFO: 'USEFUL INFO',
	};
	if ((CIP_NEWS_CATEGORIES as readonly string[]).includes(upper)) {
		return upper;
	}
	const aliased = aliases[upper];
	if (
		aliased &&
		(CIP_NEWS_CATEGORIES as readonly string[]).includes(
			aliased as CipNewsCategory,
		)
	) {
		return aliased;
	}
	return 'USEFUL INFO';
}

function normalizeNewsType(raw: unknown): CipNewsType {
	if (typeof raw !== 'string') {
		return 'REGULAR';
	}
	const upper = raw.trim().toUpperCase();
	if (
		upper === 'RETURNER' ||
		upper === 'GROUP HEADER' ||
		upper === 'GROUPHEADER'
	) {
		return upper === 'GROUPHEADER' ? 'GROUP HEADER' : (upper as CipNewsType);
	}
	return 'REGULAR';
}

function stripHtmlToPlain(html: string): string {
	return html
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function normalizeGameNewsEntry(
	raw: unknown,
	index: number,
): CipGameNewsEntry | null {
	if (!raw || typeof raw !== 'object') {
		return null;
	}
	const o = raw as Record<string, unknown>;
	const headline =
		typeof o.headline === 'string'
			? o.headline
			: typeof o.title === 'string'
				? o.title
				: null;
	if (!headline) {
		return null;
	}
	const message =
		typeof o.message === 'string'
			? o.message
			: typeof o.body === 'string'
				? o.body
				: typeof o.content === 'string'
					? o.content
					: headline;
	const publishdate = asFiniteInt(
		o.publishdate ?? o.date ?? o.datefrom,
		Math.floor(Date.now() / 1000),
	);
	const entry: CipGameNewsEntry = {
		id: asFiniteInt(o.id, index + 1),
		index: asFiniteInt(o.index, index + 1),
		category: normalizeCategory(o.category),
		headline,
		message,
		publishdate,
		type: normalizeNewsType(o.type),
		campaignid: asFiniteInt(o.campaignid, 0),
		groupheaderid: asFiniteInt(o.groupheaderid, 0),
		unlocklevel: asFiniteInt(o.unlocklevel, 0),
		isread: typeof o.isread === 'boolean' ? o.isread : true,
	};
	if (o.datefrom !== undefined) {
		entry.datefrom = asFiniteInt(o.datefrom, 0);
	}
	if (o.dateto !== undefined) {
		entry.dateto = asFiniteInt(o.dateto, 0);
	}
	if (o.specialevent !== undefined) {
		entry.specialevent = asFiniteInt(o.specialevent, 0);
	}
	return entry;
}

/** Accept legacy flat `{ title, body, date, category }` rows. */
function normalizeNewsItem(raw: unknown, index: number): OtcNewsItem | null {
	const entry = normalizeGameNewsEntry(raw, index);
	if (!entry) {
		return null;
	}
	return {
		id: entry.id,
		date: entry.publishdate,
		title: stripHtmlToPlain(entry.headline) || entry.headline,
		body: entry.message,
		category: entry.category,
	};
}

function emptyCategoryCounts(): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const c of CIP_NEWS_CATEGORIES) {
		counts[c] = 0;
	}
	return counts;
}

function buildCategoryCounts(
	entries: CipGameNewsEntry[],
): Record<string, number> {
	const counts = emptyCategoryCounts();
	for (const e of entries) {
		if (e.type === 'GROUP HEADER') {
			continue;
		}
		const key = normalizeCategory(e.category);
		counts[key] = (counts[key] ?? 0) + 1;
	}
	return counts;
}

function toFlatNewsitems(entries: CipGameNewsEntry[]): OtcNewsItem[] {
	const out: OtcNewsItem[] = [];
	for (let i = 0; i < entries.length; i++) {
		const flat = normalizeNewsItem(entries[i], i);
		if (flat) {
			out.push(flat);
		}
	}
	return out;
}

function finalizeNewsResponse(
	entries: CipGameNewsEntry[],
	extras?: Partial<CipNewsResponse>,
): CipNewsResponse {
	const maxFromEntries = entries.reduce(
		(m, e) => Math.max(m, e.publishdate),
		0,
	);
	return {
		categorycounts: extras?.categorycounts ?? buildCategoryCounts(entries),
		gamenews: entries,
		maxeditdate: extras?.maxeditdate ?? maxFromEntries,
		idOfNewestReadEntry: extras?.idOfNewestReadEntry ?? 0,
		isreturner: extras?.isreturner ?? false,
		showrewardnews: extras?.showrewardnews ?? false,
		gamenewstodelete: extras?.gamenewstodelete ?? [],
		newsitems: toFlatNewsitems(entries),
	};
}

function parseNewsPayload(raw: string): CipNewsResponse {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (Array.isArray(parsed)) {
			const entries: CipGameNewsEntry[] = [];
			for (let i = 0; i < parsed.length; i++) {
				const e = normalizeGameNewsEntry(parsed[i], i);
				if (e) {
					entries.push(e);
				}
			}
			return finalizeNewsResponse(entries);
		}
		if (!parsed || typeof parsed !== 'object') {
			return finalizeNewsResponse([]);
		}
		const obj = parsed as Record<string, unknown>;
		const list = Array.isArray(obj.gamenews)
			? obj.gamenews
			: Array.isArray(obj.newsitems)
				? obj.newsitems
				: null;
		const entries: CipGameNewsEntry[] = [];
		if (list) {
			for (let i = 0; i < list.length; i++) {
				const e = normalizeGameNewsEntry(list[i], i);
				if (e) {
					entries.push(e);
				}
			}
		}
		const categorycounts =
			obj.categorycounts && typeof obj.categorycounts === 'object'
				? {
						...emptyCategoryCounts(),
						...(obj.categorycounts as Record<string, number>),
					}
				: undefined;
		return finalizeNewsResponse(entries, {
			categorycounts,
			maxeditdate: asFiniteInt(obj.maxeditdate, 0) || undefined,
			idOfNewestReadEntry: asFiniteInt(obj.idOfNewestReadEntry, 0),
			isreturner: Boolean(obj.isreturner),
			showrewardnews: Boolean(obj.showrewardnews),
			gamenewstodelete: Array.isArray(obj.gamenewstodelete)
				? obj.gamenewstodelete
						.map((v) => asFiniteInt(v, 0))
						.filter((n) => n > 0)
				: [],
		});
	} catch (err) {
		console.warn('[otcStatus] failed to parse QTCAAC_NEWS_JSON', err);
		return finalizeNewsResponse([]);
	}
}

function resolveDefaultNewsJsonPath(): string {
	const fromEnv = process.env.QTCAAC_NEWS_DEFAULT_JSON?.trim();
	if (fromEnv) {
		return resolve(fromEnv);
	}
	return contentPath('news.json');
}

/** Stable positive int id for CIP categoryId (portal news uses cuid strings). */
function stableNewsId(key: string, fallback: number): number {
	let h = 2166136261;
	for (let i = 0; i < key.length; i++) {
		h ^= key.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	const n = h >>> 0;
	return n === 0 ? fallback : n;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/** Markdoc → simple HTML for CIP NewsDialog RichText. Never passthrough raw HTML. */
function markdocToRichText(content: string): string {
	const trimmed = content.trim();
	if (!trimmed) {
		return '';
	}
	// Admin paste of HTML must not reach CIP RichText unsanitized.
	if (/<[a-z][\s\S]*>/i.test(trimmed)) {
		return trimmed
			.split(/\n{2,}/)
			.map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
			.join('');
	}
	try {
		const ast = Markdoc.parse(trimmed);
		const transformed = Markdoc.transform(ast, {
			tags: {
				callout: { render: 'div', attributes: {} },
				row: { render: 'div', attributes: {} },
				col: { render: 'div', attributes: {} },
			},
		});
		const html = Markdoc.renderers.html(transformed);
		if (html.trim()) {
			return html;
		}
	} catch (err) {
		console.warn('[otcStatus] markdoc render failed; using plain text', err);
	}
	return trimmed
		.split(/\n{2,}/)
		.map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
		.join('');
}

async function loadDefaultNewsFile(): Promise<CipNewsResponse> {
	try {
		const raw = await readFile(resolveDefaultNewsJsonPath(), 'utf8');
		return parseNewsPayload(raw);
	} catch (err) {
		console.warn('[otcStatus] failed to read default compendium news', err);
		return finalizeNewsResponse([]);
	}
}

async function buildNewsFromDatabase(): Promise<CipNewsResponse | null> {
	try {
		const rows = await prisma.news.findMany({
			where: { published: true },
			orderBy: { created_at: 'desc' },
			take: 200,
			select: {
				id: true,
				title: true,
				content: true,
				category: true,
				created_at: true,
				updated_at: true,
			},
		});
		if (rows.length === 0) {
			return null;
		}
		const entries: CipGameNewsEntry[] = [];
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			const publishdate = Math.floor(row.created_at.getTime() / 1000);
			entries.push({
				id: stableNewsId(row.id, i + 1),
				index: i + 1,
				category: normalizeCategory(row.category),
				headline: row.title,
				message: markdocToRichText(row.content),
				publishdate,
				type: 'REGULAR',
				isread: false,
			});
		}
		const maxeditdate = rows.reduce(
			(m, r) => Math.max(m, Math.floor(r.updated_at.getTime() / 1000)),
			0,
		);
		return finalizeNewsResponse(entries, { maxeditdate });
	} catch (err) {
		console.warn('[otcStatus] failed to load news from database', err);
		return null;
	}
}

export async function buildNews(): Promise<CipNewsResponse> {
	const fromEnv = process.env.QTCAAC_NEWS_JSON?.trim();
	if (fromEnv) {
		if (fromEnv.startsWith('[') || fromEnv.startsWith('{')) {
			return parseNewsPayload(fromEnv);
		}
		try {
			const raw = await readFile(resolve(fromEnv), 'utf8');
			return parseNewsPayload(raw);
		} catch (err) {
			console.warn('[otcStatus] failed to read QTCAAC_NEWS_JSON path', err);
			return finalizeNewsResponse([]);
		}
	}

	const defaults = await loadDefaultNewsFile();
	const fromDb = await buildNewsFromDatabase();
	if (!fromDb) {
		return defaults;
	}
	// One published DB row must not wipe the default Compendium — merge DB
	// articles first, then defaults that do not share an id/headline.
	const seenIds = new Set(fromDb.gamenews.map((e) => e.id));
	const seenHeadlines = new Set(
		fromDb.gamenews.map((e) => e.headline.trim().toLowerCase()),
	);
	const merged = [...fromDb.gamenews];
	for (const entry of defaults.gamenews) {
		if (seenIds.has(entry.id)) {
			continue;
		}
		if (seenHeadlines.has(entry.headline.trim().toLowerCase())) {
			continue;
		}
		merged.push(entry);
	}
	const maxeditdate = Math.max(fromDb.maxeditdate, defaults.maxeditdate);
	return finalizeNewsResponse(merged, { maxeditdate });
}
