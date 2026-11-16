import { sessionCooldown } from './dom-util';

/** Set before a heal reload; the next /play visit repairs the files before Play. */
const REPAIR_KEY = 'qtcaac.otc.repairContent';
const HEAL_AT_KEY = 'qtcaac.otc.contentHealAt';
const HEAL_COOLDOWN_MS = 60_000;

/** Boot died before login: repair the content store on the next load (rate-limited). */
export function requestContentRepair(): boolean {
	if (!sessionCooldown(HEAL_AT_KEY, HEAL_COOLDOWN_MS)) return false;
	try {
		localStorage.setItem(REPAIR_KEY, '1');
		return true;
	} catch {
		return false;
	}
}

export function takeRepairFlag(): boolean {
	try {
		const flagged = localStorage.getItem(REPAIR_KEY) === '1';
		localStorage.removeItem(REPAIR_KEY);
		return flagged;
	} catch {
		return false;
	}
}
