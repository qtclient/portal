type ConfirmRequest = {
	title: string;
	body: string;
	resolve: (confirmed: boolean) => void;
};

let pending = $state<ConfirmRequest | null>(null);

/** Opens the layout's ConfirmDialog; resolves with the user's choice. */
export function confirm(title: string, body: string): Promise<boolean> {
	pending?.resolve(false);
	return new Promise((resolve) => {
		pending = { title, body, resolve };
	});
}

export function pendingConfirm(): ConfirmRequest | null {
	return pending;
}

export function settleConfirm(confirmed: boolean): void {
	pending?.resolve(confirmed);
	pending = null;
}
