const AUTO_ADMIN_EMAIL = privateEnv.AUTO_ADMIN_EMAIL ?? '';
const SERVER_NAME = privateEnv.SERVER_NAME ?? '';
const PUBLIC_TITLE = publicEnv.PUBLIC_TITLE ?? '';
/**
 * In-client account creation (CIP accountcreationclientservices.php JSON).
 * Primary: POST /clientservices/accountcreationclientservices.php
 * Legacy alias: POST /api/auth/create-account
 *
 * Field names match OTC createAccount.lua
 * (IsValid, IsAvailable, GeneratedName, Success, PasswordRequirements).
 */

import * as privateEnv from '$app/env/private';
import * as publicEnv from '$app/env/public';

import { AccountType } from '#lib/accounts.js';
import { PlayerPronoun, PlayerSex, PlayerVocation } from '#lib/players.js';
import {
	accountIdForGameSessionKey,
	accountPlayersSelect,
	buildOtcLoginResponse,
} from '#lib/server/otcLogin.js';
import { generateCharacterInput } from '#lib/server/players.js';
import { prisma } from '#lib/server/prisma.js';
import { resolveReferrerId } from '#lib/server/referral.js';
import { comparePassword, hashPassword } from '#lib/server/utils.js';
import { toTitleCase } from '#lib/utils.js';

import type { RequestHandler } from './$types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Printable ASCII except space (matches official create-account checklist).
const PASSWORD_RE = /^[\x21-\x7E]+$/;
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 29;

const NAME_ADJECTIVES = [
	'Brave',
	'Swift',
	'Silent',
	'Noble',
	'Lucky',
	'Calm',
	'Bold',
	'Kind',
];
const NAME_NOUNS = [
	'Wanderer',
	'Hunter',
	'Ranger',
	'Walker',
	'Scout',
	'Guard',
	'Seeker',
	'Traveler',
];

const BLOCKED_PREFIXES = ['gm ', 'dm ', 'god ', 'cm ', 'tutor ', 'senior '];
const BLOCKED_WORDS = [
	'admin',
	'administrator',
	'gamemaster',
	'game master',
	'game-master',
	PUBLIC_TITLE.toLowerCase(),
];

/** OTC createAccount.lua only allows letters and spaces. */
function otcCharacterNameError(name: string): string | null {
	if (name.length < 3 || name.length > 20) {
		return 'A name must have at least 3 and at most 20 letters.';
	}
	if (!/^[A-Za-z][A-Za-z ]*$/.test(name)) {
		return 'A name may only contain letters and spaces.';
	}
	if (name !== toTitleCase(name)) {
		return 'The first letter of a name has to be a capital letter.';
	}
	const lower = name.toLowerCase();
	if (BLOCKED_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
		return 'This name contains a blocked word.';
	}
	if (BLOCKED_WORDS.some((word) => lower.includes(word))) {
		return 'This name contains a blocked word.';
	}
	return null;
}

function createAccountEnabled(): boolean {
	const raw = String(process.env.CREATE_ACCOUNT_ENABLED || '1')
		.trim()
		.toLowerCase();
	return raw !== '0' && raw !== 'false' && raw !== 'off';
}

function playTutorialEnabled(): boolean {
	const raw = String(process.env.PUBLIC_TUTORIAL_ENABLED || '0')
		.trim()
		.toLowerCase();
	return raw === '1' || raw === 'true' || raw === 'on';
}

function worldName(): string {
	return SERVER_NAME || 'Crystal';
}

type PasswordRequirements = {
	PasswordLength: boolean;
	InvalidCharacters: boolean;
	HasLowerCase: boolean;
	HasUpperCase: boolean;
	HasNumber: boolean;
};

function analyzePassword(password: string): {
	requirements: PasswordRequirements;
	valid: boolean;
	strength: number;
	color: string;
} {
	const requirements: PasswordRequirements = {
		PasswordLength:
			password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX,
		// true = requirement met (no invalid characters), matching OTC icon widgets
		InvalidCharacters: password.length > 0 && PASSWORD_RE.test(password),
		HasLowerCase: /[a-z]/.test(password),
		HasUpperCase: /[A-Z]/.test(password),
		HasNumber: /[0-9]/.test(password),
	};
	const valid = Object.values(requirements).every(Boolean);
	const met = Object.values(requirements).filter(Boolean).length;
	const strength = valid ? (met >= 5 && password.length >= 14 ? 2 : 1) : 0;
	const color =
		strength === 2 ? '#76EE00' : strength === 1 ? '#F7CA18' : '#EC644B';
	return { requirements, valid, strength, color };
}

async function generateUnusedCharacterName(): Promise<string> {
	for (let attempt = 0; attempt < 24; attempt++) {
		const adjective =
			NAME_ADJECTIVES[Math.floor(Math.random() * NAME_ADJECTIVES.length)]!;
		const noun = NAME_NOUNS[Math.floor(Math.random() * NAME_NOUNS.length)]!;
		const name = `${adjective} ${noun}`;
		const taken = await prisma.players.findFirst({ where: { name } });
		if (!taken) {
			return name;
		}
	}
	return `Brave Wanderer`;
}

const CHARACTER_CREATE_TYPES = new Set([
	'getaccountcreationstatus',
	'checkcharactername',
	'generatecharactername',
	'createcharacter',
]);

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as Record<string, unknown>;
		// The CIP client sends `Type` in its own casing ("CheckCharacterName", "createCharacter").
		const type = String(body.type || body.Type || '')
			.trim()
			.toLowerCase();
		const now = Math.trunc(Date.now() / 1000);

		if (!createAccountEnabled() && !CHARACTER_CREATE_TYPES.has(type)) {
			return Response.json({
				errorCode: 1,
				errorMessage: 'Account creation is disabled.',
			});
		}

		if (type === 'getaccountcreationstatus') {
			const name = worldName();
			return Response.json({
				RecommendedWorld: name,
				IsCaptchaDeactivated: true,
				PlayTutorialEnabled: playTutorialEnabled(),
				Worlds: [
					{
						Name: name,
						Region: 'Local',
						PvPType: 'Optional PvP',
						PlayersOnline: 0,
						PremiumOnly: 0,
						CreationDate: now,
						BattlEyeActivationTimestamp: now,
						BattlEyeInitiallyActive: 0,
						TransferType: 'Blocked',
					},
				],
			});
		}

		if (type === 'checkemail') {
			const email = String(body.Email || body.email || '')
				.trim()
				.toLowerCase();
			if (!EMAIL_RE.test(email)) {
				return Response.json({
					errorCode: 59,
					EMail: email,
					IsValid: false,
					errorMessage:
						'This email address has an invalid format. Please enter a correct email address!',
				});
			}
			const existing = await prisma.accounts.findUnique({ where: { email } });
			if (existing) {
				return Response.json({
					errorCode: 60,
					EMail: email,
					IsValid: false,
					errorMessage: 'This email address is already in use.',
				});
			}
			return Response.json({ EMail: email, IsValid: true });
		}

		if (type === 'checkpassword') {
			const password = String(body.Password1 || body.password || '');
			const analysis = analyzePassword(password);
			return Response.json({
				Password1: password,
				PasswordValid: analysis.valid,
				PasswordStrength: analysis.strength,
				PasswordStrengthColor: analysis.color,
				PasswordRequirements: analysis.requirements,
				errorMessage: analysis.valid
					? undefined
					: 'Password does not meet the requirements.',
			});
		}

		if (type === 'checkcharactername') {
			const name = String(body.CharacterName || body.name || '').trim();
			const validationError = otcCharacterNameError(name);
			if (validationError) {
				return Response.json({
					CharacterName: name,
					errorCode: 99,
					IsAvailable: false,
					errorMessage: validationError,
				});
			}
			const taken = await prisma.players.findFirst({ where: { name } });
			if (taken) {
				return Response.json({
					CharacterName: name,
					errorCode: 61,
					IsAvailable: false,
					errorMessage: 'This character name is already in use.',
				});
			}
			return Response.json({
				CharacterName: name,
				IsAvailable: true,
			});
		}

		if (type === 'generatecharactername') {
			const name = await generateUnusedCharacterName();
			return Response.json({ GeneratedName: name });
		}

		if (type === 'createcharacter') {
			const sessionKey = String(body.SessionKey || body.sessionKey || '');
			const email = String(body.EMail || body.email || '')
				.trim()
				.toLowerCase();
			const password = String(body.Password || body.password || '');
			const characterName = String(
				body.CharacterName || body.characterName || '',
			).trim();
			const sexRaw = String(
				body.CharacterSex || body.characterSex || 'male',
			).toLowerCase();
			const sex =
				sexRaw === 'female' || sexRaw === '0'
					? PlayerSex.Female
					: PlayerSex.Male;
			// Global Newhaven: vocation is chosen in-town, never at create.
			const vocation = PlayerVocation.None;
			const tutorialEnabled = playTutorialEnabled();
			const tutorialRaw = body.tutorial ?? body.Tutorial ?? body.PlayTutorial;
			const tutorial =
				tutorialEnabled &&
				(tutorialRaw === true ||
					tutorialRaw === 'true' ||
					tutorialRaw === 'on' ||
					tutorialRaw === 'yes' ||
					tutorialRaw === '1');

			if (!sessionKey && !EMAIL_RE.test(email)) {
				return Response.json({
					errorCode: 59,
					Success: false,
					errorMessage: 'Invalid email.',
				});
			}
			if (!sessionKey && !password) {
				return Response.json({
					errorCode: 3,
					Success: false,
					errorMessage: 'Email or password is not correct.',
				});
			}
			const nameError = otcCharacterNameError(characterName);
			if (nameError) {
				return Response.json({
					errorCode: 61,
					Success: false,
					errorMessage: nameError,
				});
			}
			if (await prisma.players.findFirst({ where: { name: characterName } })) {
				return Response.json({
					errorCode: 61,
					Success: false,
					errorMessage: 'Character name already in use.',
				});
			}

			// The login answer's session key (SSO logins have no password to send).
			const sessionAccountId = sessionKey
				? await accountIdForGameSessionKey(sessionKey)
				: null;
			const account = sessionKey
				? sessionAccountId === null
					? null
					: await prisma.accounts.findUnique({
							where: { id: sessionAccountId },
						})
				: await prisma.accounts.findUnique({ where: { email } });
			if (
				!account ||
				(!sessionKey && !comparePassword(password, account.password))
			) {
				return Response.json(
					sessionKey
						? {
								errorCode: 3,
								Success: false,
								errorMessage: 'Your session has expired. Please log in again.',
							}
						: {
								errorCode: 3,
								Success: false,
								errorMessage: 'Email or password is not correct.',
							},
				);
			}

			const characterInput = generateCharacterInput({
				name: characterName,
				pronoun: PlayerPronoun.They,
				sex,
				vocation,
				tutorial,
			});

			await prisma.players.create({
				data: {
					account_id: account.id,
					...characterInput,
					is_main: false,
				},
			});

			if (!sessionKey) {
				return Response.json({
					Success: true,
					CharacterName: characterName,
				});
			}
			// CIP applies the answer like a login answer: the new character list.
			const withPlayers = await prisma.accounts.findUnique({
				where: { id: account.id },
				include: {
					players: {
						select: accountPlayersSelect,
						where: { deletion: 0 },
					},
				},
			});
			return Response.json({
				Success: true,
				CharacterName: characterName,
				...(withPlayers
					? await buildOtcLoginResponse(withPlayers, request)
					: {}),
			});
		}

		if (type === 'createaccountandcharacter') {
			const email = String(body.EMail || body.email || '')
				.trim()
				.toLowerCase();
			const password = String(body.Password || body.password || '');
			const characterName = String(
				body.CharacterName || body.characterName || '',
			).trim();
			const sexRaw = String(
				body.CharacterSex || body.characterSex || 'male',
			).toLowerCase();
			const sex =
				sexRaw === 'female' || sexRaw === '0'
					? PlayerSex.Female
					: PlayerSex.Male;
			// CIP CreateAccountDialog has no vocation picker; Global Newhaven = None.
			const vocation = PlayerVocation.None;

			if (!EMAIL_RE.test(email)) {
				return Response.json({
					errorCode: 59,
					Success: false,
					errorMessage: 'Invalid email.',
				});
			}
			if (!analyzePassword(password).valid) {
				return Response.json({
					errorCode: 62,
					Success: false,
					errorMessage: 'Password does not meet the requirements.',
				});
			}
			const nameError = otcCharacterNameError(characterName);
			if (nameError) {
				return Response.json({
					errorCode: 61,
					Success: false,
					errorMessage: nameError,
				});
			}
			if (await prisma.accounts.findUnique({ where: { email } })) {
				return Response.json({
					errorCode: 60,
					Success: false,
					errorMessage: 'Email already in use.',
				});
			}
			if (await prisma.players.findFirst({ where: { name: characterName } })) {
				return Response.json({
					errorCode: 61,
					Success: false,
					errorMessage: 'Character name already in use.',
				});
			}

			const characterInput = generateCharacterInput({
				name: characterName,
				pronoun: PlayerPronoun.They,
				sex,
				vocation,
				tutorial: false,
			});

			const isAdmin = email === AUTO_ADMIN_EMAIL;
			const referredBy = await resolveReferrerId(
				String(body.Ref || body.ref || body.referredBy || body.Referral || ''),
			);

			await prisma.accounts.create({
				data: {
					email,
					password: hashPassword(password),
					creation: now,
					type: isAdmin ? AccountType.God : AccountType.Normal,
					is_verified: true,
					...(referredBy ? { referred_by: referredBy } : {}),
					players: {
						create: {
							...characterInput,
							is_main: true,
						},
					},
				},
			});

			return Response.json({
				Success: true,
				EMail: email,
				CharacterName: characterName,
			});
		}

		return Response.json({
			errorCode: 1,
			errorMessage: `Unknown type: ${type || '(empty)'}`,
		});
	} catch (error) {
		console.warn('[create-account] failed', error);
		return Response.json(
			{ errorCode: 1, errorMessage: 'Internal create-account error.' },
			{ status: 500 },
		);
	}
};

/** OTC may probe with OPTIONS for CORS. */
export const OPTIONS: RequestHandler = async () => {
	return new Response(null, { status: 204 });
};
