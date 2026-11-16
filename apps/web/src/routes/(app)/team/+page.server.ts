import { groupStaffByRole, listStaffMembers } from '#lib/server/staff.js';

import type { PageServerLoad } from './$types';

export const load = (async () => {
	const staff = await listStaffMembers();
	const groups = [...groupStaffByRole(staff).entries()].map(
		([name, members]) => ({
			name,
			members,
		}),
	);

	return {
		title: 'Staff',
		groups,
	};
}) satisfies PageServerLoad;
