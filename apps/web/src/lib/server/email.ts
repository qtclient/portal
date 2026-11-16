import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import type { ComponentProps } from 'svelte';
import {
	createTestAccount,
	createTransport,
	getTestMessageUrl,
	type Transporter,
} from 'nodemailer';
import { render } from 'svelte/server';

import * as privateEnv from '$app/env/private';

import Base from '#lib/emails/Base.svelte';

const NO_REPLY_EMAIL = privateEnv.NO_REPLY_EMAIL ?? '';
const SMTP_PASSWORD = privateEnv.SMTP_PASSWORD ?? '';
const SMTP_PORT = privateEnv.SMTP_PORT ?? '';
const SMTP_SERVER = privateEnv.SMTP_SERVER ?? '';
const SMTP_USER = privateEnv.SMTP_USER ?? '';

/** Development falls back to ethereal.email; production needs SMTP_SERVER. */
export const emailEnabled =
	(process.env.NODE_ENV ?? 'development') !== 'production' ||
	SMTP_SERVER !== '';

export type EmailTemplate = {
	subject: string;
	props: ComponentProps<typeof Base>;
};

export async function sendMail(to: string, template: EmailTemplate) {
	// send mail with defined transport object
	const { head, body } = render(Base, { props: template.props });
	const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">${head}</head><body>${body}</body></html>`;
	const transporter = await getTransporter();
	const info = await transporter.sendMail({
		from: NO_REPLY_EMAIL,
		to,
		subject: template.subject,
		html,
	});

	console.log('Message sent: %s', info.messageId);
	console.log('Preview URL: %s', getTestMessageUrl(info));
}

export async function sendVerificationEmail(to: string, token: string) {
	await sendMail(to, {
		subject: 'Verify your account',
		props: {
			title: 'Verify your account',
			buttonText: 'Verify Email',
			href: `/account/verify?email=${to}&token=${token}`,
			previewText: 'Click the button below to verify your email address.',
			paragraphs: [
				'Welcome to the game! We just need to verify your email address before you can start playing.',
				'If you did not create an account, you can safely ignore this email.',
			],
		},
	});
}

const transporter: Record<
	string,
	Transporter<SMTPTransport.SentMessageInfo>
> = {};

async function getTransporter() {
	const env = process.env.NODE_ENV ?? 'development';
	if (transporter[env]) {
		return transporter[env];
	}
	if (env === 'production') {
		// Use a real mail service in production
		transporter[env] = createTransport({
			host: SMTP_SERVER,
			port: Number(SMTP_PORT),
			secure: false,
			auth: {
				user: SMTP_USER,
				pass: SMTP_PASSWORD,
			},
		});
	} else {
		// Use ethereal.email in development
		const testAccount = await createTestAccount();
		transporter[env] = createTransport({
			host: 'smtp.ethereal.email',
			port: 587,
			secure: false,
			auth: {
				user: testAccount.user,
				pass: testAccount.pass,
			},
		});
	}
	return transporter[env];
}
