import {
	createGuardrails,
	generateSecret,
	generateURI,
	verifySync,
} from 'otplib';

// Secrets issued by otplib 12 are 10 bytes; v13 rejects anything under 16.
const guardrails = createGuardrails({ MIN_SECRET_BYTES: 10 });

export function checkTotp(token: string, secret: string): boolean {
	try {
		return verifySync({ token, secret, guardrails }).valid;
	} catch {
		return false;
	}
}

export function newTotpSecret(): string {
	return generateSecret();
}

export function totpURI(label: string, issuer: string, secret: string): string {
	return generateURI({ label, issuer, secret });
}
