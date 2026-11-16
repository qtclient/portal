import { redirect } from 'sveltekit-flash-message/server';

import { emailEnabled, sendVerificationEmail } from '#lib/server/email.js';
import { prisma } from '#lib/server/prisma.js';
import { requireLogin } from '#lib/server/session.js';

import type { PageServerLoad } from './$types';

export const load = (async (event) => {
	const { locals } = event;
	requireLogin(locals);
	if (!emailEnabled) {
		redirect(
			'/account',
			{
				type: 'error',
				message: 'Email verification is currently unavailable.',
			},
			event,
		);
	}

	const account = await prisma.accounts.findUniqueOrThrow({
		where: { id: locals.session?.accountId },
	});
	const oldVerification = await prisma.emailVerification.findFirst({
		where: { account_id: account.id },
		orderBy: { created_at: 'desc' },
	});
	if (account.is_verified && !oldVerification) {
		await prisma.emailVerification.deleteMany({
			where: { account_id: account.id },
		});
		redirect(302, '/account');
	}
	const verification = await prisma.emailVerification.create({
		data: {
			account_id: account.id,
			expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
			new_email: oldVerification?.new_email,
		},
	});

	await sendVerificationEmail(account.email, verification.token);
	redirect(
		`/account`,
		{
			type: 'success',
			message:
				'Verification re-sent. Check your email to confirm your account.',
		},
		event,
	);
}) satisfies PageServerLoad;
