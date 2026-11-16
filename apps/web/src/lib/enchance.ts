import {
	type ActionResult,
	applyAction,
	enhance as original,
	type SubmitFunction,
} from '$app/forms';
import { goto } from '$app/navigation';

import { setLoading } from '#lib/stores/loading.svelte.js';

export function enhance(form: HTMLFormElement, submit?: SubmitFunction) {
	async function handleSubmit(input: Parameters<SubmitFunction>[0]) {
		setLoading(true);
		if (submit) {
			const callback = await submit(input);
			setLoading(false);
			if (callback) return callback;
		}

		const noReset = form.dataset['enhanceNoreset'] != null;
		const noScroll = form.dataset['enhanceNoscroll'] != null;

		return async ({
			result,
			update,
		}: {
			result: ActionResult;
			update: (options?: {
				reset?: boolean;
				navigate?: boolean;
			}) => Promise<void>;
		}) => {
			setLoading(false);
			if (result.type === 'error') {
				return applyAction(result);
			}
			if (result.type === 'success') {
				return update({ reset: !noReset, navigate: false });
			}
			if (noScroll && result.type === 'redirect') {
				return goto(result.location, {
					refreshAll: true,
					reset: false,
					replace: true,
				});
			}
			return applyAction(result);
		};
	}
	return original(form, handleSubmit);
}
