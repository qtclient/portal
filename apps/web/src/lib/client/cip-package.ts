/**
 * CipSoft tip packages on /play, in OPFS under `packages/<name>/` like desktop
 * AppData (cip-fs.md).
 *
 * The portal installs one package itself: the launcher binary, which must
 * exist before any wasm runs (desktop ships it as the installed app). It uses
 * the CipSoft package.json contract (the launcher's TPackage): files[].url relative to
 * the package.json directory, packedhash / unpackedhash / unpackedsize checked,
 * package.json.version written last. Every other package (the client, CipSoft
 * assets) is the launcher's install.
 */
import { packageEngineDir, packageFsRoot } from './cip-fs.js';
import { unpackLzmaAlone } from './lzma-alone.js';
import { readFile, writeFile } from './opfs.js';

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
	label: string;
	/** 0–100 overall. */
	progress: number;
};

async function sha256Hex(data: Uint8Array): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', data as BufferSource);
	return [...new Uint8Array(digest)]
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

async function fetchPackageDoc(packageBase: string): Promise<CipPackageDoc> {
	const res = await fetch(`${packageBase}/package.json`, { cache: 'no-store' });
	if (!res.ok) throw new Error(`package.json HTTP ${res.status}`);
	const doc = (await res.json()) as CipPackageDoc;
	if (!doc.version || !Array.isArray(doc.files)) {
		throw new Error('package.json missing version/files');
	}
	return doc;
}

/**
 * Install a tip package into OPFS, every file, unless its package.json.version
 * already matches the tip — what the desktop installer does for the launcher.
 */
export async function ensurePackage(opts: {
	packageName: string;
	packageBase: string;
	onProgress?: (p: PackageProgress) => void;
}): Promise<{ version: string; fromCache: boolean }> {
	const { packageName, onProgress } = opts;
	const packageBase = opts.packageBase.replace(/\/+$/, '');
	const root = packageFsRoot(packageName);
	onProgress?.({ label: 'Checking package version…', progress: 5 });
	const doc = await fetchPackageDoc(packageBase);
	const local = await readFile(`${root}/package.json.version`);
	if (local && new TextDecoder().decode(local).trim() === doc.version) {
		return { version: doc.version, fromCache: true };
	}

	const files = doc.files;
	const totalPacked =
		files.reduce((s, f) => s + Math.max(f.packedsize, 0), 0) || 1;
	let donePacked = 0;
	for (const [i, file] of files.entries()) {
		onProgress?.({
			label: `Downloading… ${i + 1}/${files.length}`,
			progress: 10 + Math.round((donePacked / totalPacked) * 80),
		});
		// no-store: a tip dir rewritten in place must not serve a cached lzma.
		const res = await fetch(`${packageBase}/${file.url.replace(/^\/+/, '')}`, {
			cache: 'no-store',
		});
		if (!res.ok)
			throw new Error(`Download failed: ${file.url} (${res.status})`);
		const packed = new Uint8Array(await res.arrayBuffer());
		if ((await sha256Hex(packed)) !== file.packedhash)
			throw new Error(`packed hash mismatch for ${file.localfile}`);
		const unpacked = await unpackLzmaAlone(packed);
		if (
			unpacked.byteLength !== file.unpackedsize ||
			(await sha256Hex(unpacked)) !== file.unpackedhash
		)
			throw new Error(`unpacked hash/size mismatch for ${file.localfile}`);
		await writeFile(`${root}/${file.localfile}`, unpacked);
		donePacked += Math.max(file.packedsize, 0);
	}
	const text = new TextEncoder();
	await writeFile(
		`${root}/package.json`,
		text.encode(`${JSON.stringify(doc, null, 2)}\n`),
	);
	// Version last: it marks the package complete.
	await writeFile(
		`${root}/package.json.version`,
		text.encode(`${doc.version}\n`),
	);
	onProgress?.({ label: 'Ready…', progress: 100 });
	return { version: doc.version, fromCache: false };
}

/** One installed engine file (the binaries the portal boots). */
export async function readEngineFile(
	packageName: string,
	name: string,
): Promise<ArrayBuffer> {
	const path = `${packageEngineDir(packageName)}/${name}`;
	const bytes = await readFile(path);
	if (!bytes)
		throw new Error(`Missing ${path} — install via the launcher first.`);
	return bytes.buffer as ArrayBuffer;
}
