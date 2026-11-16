/**
 * Site URL router: section + ?subtopic= ↔ page paths, account aliases, .php strip.
 */

export type Section =
	| 'news'
	| 'abouttibia'
	| 'gameguides'
	| 'library'
	| 'community'
	| 'account'
	| 'charactertrade'
	| 'support';

type SubtopicRoute = {
	section: Section;
	subtopic: string;
	/** Page that implements the view. */
	path: string;
};

const SUBTOPIC_ROUTES: readonly SubtopicRoute[] = [
	{ section: 'news', subtopic: 'latestnews', path: '/' },
	{ section: 'news', subtopic: 'newsarchive', path: '/news/archive' },
	{ section: 'news', subtopic: 'eventcalendar', path: '/events' },
	{ section: 'community', subtopic: 'characters', path: '/characters' },
	{ section: 'community', subtopic: 'worlds', path: '/online' },
	{ section: 'community', subtopic: 'highscores', path: '/highscores' },
	{ section: 'community', subtopic: 'houses', path: '/houses' },
	{ section: 'community', subtopic: 'guilds', path: '/guilds' },
	{ section: 'community', subtopic: 'killstatistics', path: '/last-kills' },
	{ section: 'community', subtopic: 'fansites', path: '/team' },
	{
		section: 'charactertrade',
		subtopic: 'currentcharactertrades',
		path: '/bazaar',
	},
	{
		section: 'charactertrade',
		subtopic: 'pastcharactertrades',
		path: '/bazaar/past',
	},
	{
		section: 'charactertrade',
		subtopic: 'createcharactertrade',
		path: '/bazaar/create',
	},
	{ section: 'account', subtopic: 'downloadclient', path: '/download' },
	{ section: 'account', subtopic: 'createaccount', path: '/account/signup' },
	{ section: 'account', subtopic: 'accountmanagement', path: '/account/login' },
	{ section: 'account', subtopic: 'lostaccount', path: '/account/lost' },
];

const SECTIONS = new Set<string>([
	'news',
	'abouttibia',
	'gameguides',
	'library',
	'community',
	'account',
	'charactertrade',
	'support',
]);

/** Build a section URL for nav links. */
export function siteHref(
	section: Section,
	subtopic?: string,
	extra?: Record<string, string>,
): string {
	const params = new URLSearchParams();
	if (subtopic) params.set('subtopic', subtopic);
	if (extra) {
		for (const [k, v] of Object.entries(extra)) params.set(k, v);
	}
	const q = params.toString();
	return q ? `/${section}?${q}` : `/${section}`;
}

function matchSubtopic(
	section: string,
	subtopic: string | null,
): string | null {
	const s = subtopic || '';
	if (section === 'library' && s.startsWith('page:')) {
		return `/pages/${s.slice(5)}`;
	}
	if (section === 'news' && s === '') return '/';
	if (section === 'charactertrade' && s === '') return '/bazaar';

	const hit = SUBTOPIC_ROUTES.find(
		(r) => r.section === section && r.subtopic === s,
	);
	return hit?.path ?? null;
}

function accountRedirect(
	subtopic: string | null,
	searchParams: URLSearchParams,
): string | null {
	if (subtopic === 'redirectlogin') {
		if (searchParams.get('clienttarget') === 'payment') {
			const payments =
				typeof process !== 'undefined'
					? process.env.PUBLIC_PAYMENTS_URL?.replace(/\/+$/, '')
					: undefined;
			if (payments) return payments;
		}
		return '/account/login';
	}
	return matchSubtopic('account', subtopic);
}

/**
 * Resolve an inbound request to a redirect Location, or null to keep handling
 * the current path (page load / API).
 */
export function resolve(url: URL): string | null {
	const pathname = url.pathname.replace(/\/+$/, '') || '/';
	const search = url.search;

	const php = stripPhp(pathname, search);
	if (php) return php;

	if (pathname === '/account') {
		const target = accountRedirect(
			url.searchParams.get('subtopic'),
			url.searchParams,
		);
		if (!target) return null;
		if (/^https?:\/\//i.test(target)) return target;
		const next = new URL(target, url);
		for (const [key, value] of url.searchParams) {
			if (key !== 'subtopic') next.searchParams.set(key, value);
		}
		return `${next.pathname}${next.search}`;
	}

	const section = pathname.slice(1);
	if (!SECTIONS.has(section)) return null;

	const impl = matchSubtopic(section, url.searchParams.get('subtopic'));
	if (impl && impl !== pathname) return impl;
	return null;
}

/** Inbound `*.php` website paths → extensionless; clientservices untouched. */
export function stripPhp(pathname: string, search: string): string | null {
	if (pathname.startsWith('/clientservices/')) return null;

	if (pathname === '/account/index.php' || pathname === '/account/index.php/') {
		const params = new URLSearchParams(
			search.startsWith('?') ? search.slice(1) : search,
		);
		const pretty = accountRedirect(params.get('subtopic'), params);
		if (pretty) {
			params.delete('subtopic');
			const q = params.toString();
			if (/^https?:\/\//i.test(pretty)) return pretty;
			return q ? `${pretty}?${q}` : pretty;
		}
		return `/account${search || ''}`;
	}

	if (pathname === '/index.php' || pathname.startsWith('/index.php/')) {
		const rest = pathname.slice('/index.php'.length);
		if (rest === '' || rest === '/' || rest.startsWith('/survey')) {
			return '/survey';
		}
		const stripped = rest.replace(/\.php$/i, '').replace(/\/$/, '') || '';
		return stripped ? stripped : '/';
	}

	if (pathname.endsWith('.php')) {
		const without = pathname.slice(0, -'.php'.length) || '/';
		return `${without}${search || ''}`;
	}

	return null;
}
