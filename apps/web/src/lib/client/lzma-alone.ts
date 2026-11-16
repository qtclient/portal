/**
 * CIP package blobs are LZMA Alone (5-byte props + 8-byte unpacked size + payload),
 * same as apps/otclient/tibia/tibia/launcher/unpack.cpp.
 */
import { decompress } from 'lzma1';

export function unpackLzmaAlone(packed: Uint8Array): Promise<Uint8Array> {
	if (packed.byteLength < 13) {
		return Promise.reject(new Error('lzma: truncated alone header'));
	}
	try {
		const out = decompress(packed);
		if (!out?.byteLength) {
			return Promise.reject(new Error('lzma: empty result'));
		}
		return Promise.resolve(out);
	} catch (err) {
		return Promise.reject(err instanceof Error ? err : new Error(String(err)));
	}
}
