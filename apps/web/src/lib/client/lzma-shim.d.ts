declare module 'lzma1' {
	export function decompress(
		data: ArrayBuffer | ArrayBufferView,
		options?: { maxSize?: number },
	): Uint8Array;
}
