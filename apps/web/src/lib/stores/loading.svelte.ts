import { navigating } from '$app/state';

let pending = $state(false);

export function setLoading(value: boolean) {
	pending = value;
}

export function isLoading(): boolean {
	return navigating.to != null || pending;
}
