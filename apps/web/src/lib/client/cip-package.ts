/**
 * CIP tip package.json install into IndexedDB (pre-Emscripten bootstrap).
 * Same files[] / packedhash / unpackedhash contract as PackageClient.
 */
import {
	type CipIdbFile,
	idbGetFile,
	idbGetVersion,
	idbPutBytes,
	sha256Hex,
} from './cip-fs.js';
import { unpackLzmaAlone } from './lzma-alone.js';

export type CipFileRec = {
	url: string;
	localfile: string;
	packedhash: string;
	packedsize: number;
	unpackedhash: string;
	unpackedsize: number;
};

export type CipPackageDoc = {
	version: string;
	files: CipFileRec[];
	executable?: string;
};

export type PackageProgress = {
	phase: 'check' | 'download' | 'decompress' | 'store' | 'done';
	label: string;
	/** 0–100 overall. */
	progress: number;
	fileIndex?: number;
	fileCount?: number;
	bytesLoaded?: number;
	bytesTotal?: number;
};

function resolveFileUrl(packageBase: string, fileUrl: string): string {
	// Tip paths may be root-relative (`/launcher/...`). `new URL(rel, "/…")`
	// throws — base must be absolute. Join paths instead.
	if (/^[a-z][a-z0-9+.-]*:/i.test(fileUrl)) return fileUrl;
	if (fileUrl.startsWith('/')) return fileUrl;
	const base = packageBase.replace(/\/+$/, '');
	return `${base}/${fileUrl.replace(/^\/+/, '')}`;
}

/**
 * Prefer content/<aa>/<packedhash> over tip-relative localfile.lzma.
 * Tip dirs (`tibiaclient-web-current`) rewrite in place; static CDN used to
 * mark all `/launcher/` as immutable, so browsers kept stale lzma next to a
 * fresh package.json → "packed hash mismatch for tibia.js".
 */
function packedBlobUrl(packageBase: string, file: CipFileRec): string {
	const tip = resolveFileUrl(packageBase, file.url);
	const hash = (file.packedhash || '').trim().toLowerCase();
	if (!/^[a-f0-9]{64}$/.test(hash)) return tip;
	const root = packageBase
		.replace(/\/+$/, '')
		.replace(/\/launcher\/[^/]+$/, '');
	if (!root) return tip;
	return `${root}/content/${hash.slice(0, 2)}/${hash}`;
}

export async function fetchPackageDoc(
	packageBase: string,
): Promise<CipPackageDoc> {
	const base = packageBase.replace(/\/+$/, '');
	const res = await fetch(`${base}/package.json`, { cache: 'no-store' });
	if (!res.ok) throw new Error(`package.json HTTP ${res.status}`);
	const doc = (await res.json()) as CipPackageDoc;
	if (!doc.version || !Array.isArray(doc.files)) {
		throw new Error('package.json missing version/files');
	}
	return doc;
}

async function downloadWithProgress(
	url: string,
	expectedSize: number,
	onBytes: (loaded: number, total: number) => void,
): Promise<Uint8Array> {
	// Tip package.json is fetched with no-store; packed blobs must be too —
	// otherwise a cached tip lzma fails the fresh packedhash check.
	const res = await fetch(url, { cache: 'no-store' });
	if (!res.ok) throw new Error(`Download failed: ${url} (${res.status})`);
	const total = Number(res.headers.get('content-length') || expectedSize || 0);
	const reader = res.body?.getReader();
	if (!reader) {
		const buf = new Uint8Array(await res.arrayBuffer());
		onBytes(buf.byteLength, total || buf.byteLength);
		return buf;
	}
	const chunks: Uint8Array[] = [];
	let loaded = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;
		chunks.push(value);
		loaded += value.byteLength;
		onBytes(loaded, total);
	}
	const out = new Uint8Array(loaded);
	let offset = 0;
	for (const c of chunks) {
		out.set(c, offset);
		offset += c.byteLength;
	}
	return out;
}

async function fileUpToDate(
	packageName: string,
	file: CipFileRec,
	version: string,
): Promise<boolean> {
	const row = await idbGetFile(packageName, file.localfile);
	if (!row || row.version !== version) return false;
	if (row.unpackedhash !== file.unpackedhash) return false;
	if (row.bytes.byteLength !== file.unpackedsize) return false;
	return true;
}

/**
 * Ensure a CIP tip package is fully present in IndexedDB.
 * Skips files whose version + unpackedhash already match.
 */
export async function ensurePackageInIdb(opts: {
	packageName: string;
	packageBase: string;
	/** If set, only these localfiles (plus version stamp). Default: all files[]. */
	localfiles?: string[];
	onProgress?: (p: PackageProgress) => void;
}): Promise<{ version: string; fromCache: boolean }> {
	const { packageName, packageBase, onProgress } = opts;
	onProgress?.({
		phase: 'check',
		label: 'Checking package version…',
		progress: 5,
	});
	const doc = await fetchPackageDoc(packageBase);
	const want = opts.localfiles
		? doc.files.filter((f) => opts.localfiles!.includes(f.localfile))
		: doc.files;
	if (want.length === 0)
		throw new Error(`No files to install for ${packageName}`);

	const localVer = await idbGetVersion(packageName);
	const pending: CipFileRec[] = [];
	for (const f of want) {
		if (!(await fileUpToDate(packageName, f, doc.version))) pending.push(f);
	}
	const stampOk =
		localVer === doc.version &&
		(await idbGetFile(packageName, 'package.json.version'));

	if (pending.length === 0 && stampOk) {
		onProgress?.({
			phase: 'done',
			label: 'Using cached package…',
			progress: 100,
		});
		return { version: doc.version, fromCache: true };
	}

	const totalPacked =
		pending.reduce((s, f) => s + Math.max(f.packedsize, 0), 0) || 1;
	let donePacked = 0;
	const fileCount = pending.length;

	for (let i = 0; i < pending.length; i++) {
		const file = pending[i]!;
		const url = packedBlobUrl(packageBase, file);
		const fileIndex = i + 1;
		const fileLabel = `Downloading… ${fileIndex}/${fileCount}`;
		onProgress?.({
			phase: 'download',
			label: fileLabel,
			progress: 10 + Math.round((donePacked / totalPacked) * 70),
			fileIndex,
			fileCount,
			bytesLoaded: 0,
			bytesTotal: file.packedsize,
		});
		const packed = await downloadWithProgress(
			url,
			file.packedsize,
			(loaded, total) => {
				onProgress?.({
					phase: 'download',
					label: fileLabel,
					progress: 10 + Math.round(((donePacked + loaded) / totalPacked) * 70),
					fileIndex,
					fileCount,
					bytesLoaded: loaded,
					bytesTotal: total || file.packedsize,
				});
			},
		);
		const ph = await sha256Hex(packed);
		if (ph !== file.packedhash) {
			throw new Error(`packed hash mismatch for ${file.localfile}`);
		}
		onProgress?.({
			phase: 'decompress',
			label: `Unpacking… ${fileIndex}/${fileCount}`,
			progress:
				10 + Math.round(((donePacked + packed.byteLength) / totalPacked) * 70),
			fileIndex,
			fileCount,
		});
		const unpacked = await unpackLzmaAlone(packed);
		const uh = await sha256Hex(unpacked);
		if (uh !== file.unpackedhash || unpacked.byteLength !== file.unpackedsize) {
			throw new Error(`unpacked hash/size mismatch for ${file.localfile}`);
		}
		onProgress?.({
			phase: 'store',
			label: `Saving… ${fileIndex}/${fileCount}`,
			progress:
				10 + Math.round(((donePacked + packed.byteLength) / totalPacked) * 75),
			fileIndex,
			fileCount,
		});
		await idbPutBytes(
			packageName,
			file.localfile,
			doc.version,
			file.unpackedhash,
			unpacked,
		);
		donePacked += Math.max(file.packedsize, packed.byteLength);
	}

	const verBytes = new TextEncoder().encode(`${doc.version}\n`);
	await idbPutBytes(
		packageName,
		'package.json.version',
		doc.version,
		await sha256Hex(verBytes),
		verBytes,
	);
	const pkgJson = new TextEncoder().encode(`${JSON.stringify(doc, null, 2)}\n`);
	await idbPutBytes(
		packageName,
		'package.json',
		doc.version,
		await sha256Hex(pkgJson),
		pkgJson,
	);

	onProgress?.({
		phase: 'done',
		label: 'Ready…',
		progress: 100,
	});
	return { version: doc.version, fromCache: false };
}

export async function requireIdbFile(
	packageName: string,
	localfile: string,
): Promise<CipIdbFile> {
	const row = await idbGetFile(packageName, localfile);
	if (!row) {
		throw new Error(
			`Missing ${packageName}/${localfile} — install via the launcher first.`,
		);
	}
	return row;
}

export function blobUrlForBytes(
	bytes: ArrayBuffer,
	mime = 'application/javascript',
): string {
	return URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
}
