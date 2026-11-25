/**
 * Page ↔ qtclient WASM contract. Every field here is read or called by
 * `apps/qtclient/client/tibia/` browser platform glue (EM_ASM), Emscripten
 * runtime glue, or the boot guard — keep names stable.
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
	_otc_sync_shell_layout?: () => void;
	_otc_request_shell_layout?: () => void;
	_otc_signal_dom_input?: () => void;
};

declare global {
	interface Window {
		Module?: EmscriptenModule;
		callMain?: () => void;
		/** Set once otclient.js has parsed (onload); Emscripten cannot re-init in-page. */
		__QTCLIENT_OTC_LOADED?: boolean;

		OTC_IS_MOBILE?: boolean;
		/** HUD displayDensity last applied via otcApplyUiScale (device px per UI px). */
		OTC_UI_SCALE?: number;
		/** devicePixelRatio used for the canvas backing store. */
		OTC_DPR?: number;
		/** Canvas backing store in device pixels (play box × OTC_DPR). */
		OTC_UI_LAYOUT_W?: number;
		OTC_UI_LAYOUT_H?: number;
		/** Play-stage CSS size (independent of HUD density). */
		OTC_UI_BOX_W?: number;
		OTC_UI_BOX_H?: number;
		/** True while pinch / middle-drag view gesture owns the pointer. */
		OTC_VIEW_GESTURE?: boolean;

		/** Side channels for otcTakePendingInput results 3 (focus) and 2 (key). */
		_otcDrainFocusIndex?: number;
		_otcDrainSpecial?: number;
		_otcDrainMods?: number;

		otcApplyUiScale?: (scale: number) => [number, number];
		/** Map viewport client coords → canvas backing px (pre-density). */
		otcMapClientToLayout?: (
			clientX: number,
			clientY: number,
		) => [number, number];
		otcNeedsTextSinks?: () => boolean;
		otcSetEditableHotspots?: (packed: string) => void;
		otcFocusSinkAt?: (index: number) => void;
		otcTakePendingInput?: () => number;
		otcTakeDrainCodepoint?: () => number;
		otcOnBrowserWindowReady?: (callbackData: number) => void;

		/**
		 * tibia.wasm → portal: login UI is up / about to enter application.exec.
		 * Used to drop `#play-transition` because `qtLoad` never resolves under JSPI.
		 */
		__qtclientGameUiReady?: () => void;
	}
}
