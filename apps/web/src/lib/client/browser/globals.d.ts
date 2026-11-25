/**
 * Page ↔ qtclient WASM contract. Keep names stable with EM_ASM / portal boot.
 */

export type EmscriptenModule = {
	canvas?: HTMLCanvasElement | null;
	locateFile?: (path: string) => string;
	preRun?: Array<() => void>;
	postRun?: Array<() => void>;
	print?: (...args: unknown[]) => void;
	printErr?: (...args: unknown[]) => void;
	onAbort?: (reason: unknown) => void;
	setStatus?: (text: string) => void;
	monitorRunDependencies?: (left: number) => void;
	calledRun?: boolean;
	ccall?: (
		name: string,
		ret: string | null,
		types: string[],
		args: unknown[],
	) => unknown;
};

declare global {
	interface Window {
		Module?: EmscriptenModule;
		callMain?: () => void;
		/** Set once tibia.js has parsed (onload); Emscripten cannot re-init in-page. */
		__QTCLIENT_WASM_LOADED?: boolean;

		QTCLIENT_IS_MOBILE?: boolean;
		/** HUD displayDensity (device px per UI px). */
		QTCLIENT_UI_SCALE?: number;
		/** devicePixelRatio used for the canvas backing store. */
		QTCLIENT_DPR?: number;
		/** Canvas backing store in device pixels. */
		QTCLIENT_UI_LAYOUT_W?: number;
		QTCLIENT_UI_LAYOUT_H?: number;
		/** Play-stage CSS size (independent of HUD density). */
		QTCLIENT_UI_BOX_W?: number;
		QTCLIENT_UI_BOX_H?: number;
		/** True while pinch / middle-drag view gesture owns the pointer. */
		QTCLIENT_VIEW_GESTURE?: boolean;

		/**
		 * tibia.wasm → portal: login UI is up / about to enter application.exec.
		 * Used to drop `#play-transition` because `qtLoad` never resolves under JSPI.
		 */
		__qtclientGameUiReady?: () => void;
	}
}
