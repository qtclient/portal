import { describe, expect, test } from 'bun:test';

import { detectBrowser, JSPI_FLOOR, unsupportedBrowserMessage } from './browser-floor.js';

const UA = {
	iphoneSafari:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1',
	iphoneChrome:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.0.0 Mobile/15E148 Safari/604.1',
	ipadDesktopMode:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
	macChrome:
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
	winEdge:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
	linuxFirefox:
		'Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0',
	androidChrome:
		'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
};

describe('detectBrowser', () => {
	test('iPhone Safari keeps the Safari version', () => {
		expect(detectBrowser(UA.iphoneSafari)).toEqual({
			family: 'safari',
			version: 26,
			os: 'ios',
		});
	});

	test('iOS Chrome is a WebKit shell without a useful version', () => {
		expect(detectBrowser(UA.iphoneChrome)).toEqual({
			family: 'chrome',
			version: null,
			os: 'ios',
		});
	});

	test('iPad desktop-mode Safari is told apart by touch points', () => {
		expect(detectBrowser(UA.ipadDesktopMode, 5).os).toBe('ipados');
		expect(detectBrowser(UA.ipadDesktopMode, 0).os).toBe('macos');
	});

	test('desktop families and versions', () => {
		expect(detectBrowser(UA.macChrome)).toEqual({ family: 'chrome', version: 131, os: 'macos' });
		expect(detectBrowser(UA.winEdge)).toEqual({ family: 'edge', version: 130, os: 'windows' });
		expect(detectBrowser(UA.linuxFirefox)).toEqual({
			family: 'firefox',
			version: 140,
			os: 'linux',
		});
		expect(detectBrowser(UA.androidChrome)).toEqual({
			family: 'chrome',
			version: 120,
			os: 'android',
		});
		expect(detectBrowser('curl/8.0').family).toBe('other');
	});
});

describe('unsupportedBrowserMessage', () => {
	test('iOS says to update the system, not the browser', () => {
		const msg = unsupportedBrowserMessage(detectBrowser(UA.iphoneChrome));
		expect(msg).toContain(`iOS ${JSPI_FLOOR.ios} or later`);
		expect(msg).toContain('Software Update');
		expect(msg).not.toContain('/download');
	});

	test('desktop browsers get their floor and the desktop client', () => {
		const ff = unsupportedBrowserMessage(detectBrowser(UA.linuxFirefox));
		expect(ff).toContain(`Firefox ${JSPI_FLOOR.firefox} or later (this one is 140)`);
		expect(ff).toContain('/download');
		const edge = unsupportedBrowserMessage(detectBrowser(UA.winEdge));
		expect(edge).toContain(`Edge ${JSPI_FLOOR.edge} or later`);
		const other = unsupportedBrowserMessage(detectBrowser('curl/8.0'));
		expect(other).toContain(`Safari ${JSPI_FLOOR.safari}+`);
	});
});
