import { buildEventSchedule } from '#lib/server/otcStatus.js';

import type { PageServerLoad } from './$types';

export const load = (async () => {
	const { eventlist, lastupdatetimestamp } = await buildEventSchedule();
	const now = Math.floor(Date.now() / 1000);

	const events = [...eventlist]
		.sort((a, b) => a.startdate - b.startdate)
		.map((event) => {
			const active = event.startdate <= now && event.enddate >= now;
			const upcoming = event.startdate > now;
			return {
				...event,
				active,
				upcoming,
				past: event.enddate < now,
			};
		});

	return {
		title: 'Event schedule',
		lastUpdated: lastupdatetimestamp,
		active: events.filter((e) => e.active),
		upcoming: events.filter((e) => e.upcoming),
		past: events.filter((e) => e.past).reverse(),
	};
}) satisfies PageServerLoad;
