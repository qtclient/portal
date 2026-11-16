import type { Action } from 'svelte/action';

/** Re-parents the node under `target` (selector or element) while mounted. */
export const portal: Action<HTMLElement, string | HTMLElement | undefined> = (
	node,
	target = 'body',
) => {
	function attach(to: string | HTMLElement) {
		const parent = typeof to === 'string' ? document.querySelector(to) : to;
		parent?.appendChild(node);
	}
	attach(target);
	return {
		update: (to) => attach(to ?? 'body'),
		destroy: () => node.remove(),
	};
};
