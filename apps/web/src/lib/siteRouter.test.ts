import { describe, expect, test } from 'bun:test';

import { resolve } from './siteRouter.js';

const at = (path: string) => resolve(new URL(path, 'https://www.example.com'));

describe('CIP charactertrade URLs', () => {
	test('lists', () => {
		expect(at('/charactertrade?subtopic=currentcharactertrades')).toBe('/bazaar');
		expect(at('/charactertrade?subtopic=pastcharactertrades')).toBe('/bazaar/past');
		expect(at('/charactertrade?subtopic=ownbids')).toBe('/account/bazaar/bids');
		expect(at('/charactertrade?subtopic=owncharactertrades')).toBe('/account/bazaar');
	});

	test('auction details', () => {
		expect(
			at(
				'/charactertrade?subtopic=currentcharactertrades&page=details&auctionid=2310427&source=overview&currentpage=2',
			),
		).toBe('/bazaar/2310427');
		expect(at('/charactertrade?subtopic=pastcharactertrades&page=details&auctionid=abc')).toBe(
			'/bazaar/abc',
		);
		expect(at('/charactertrade?page=details&auctionid=../x')).not.toBe('/bazaar/../x');
	});
});
