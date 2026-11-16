/** CI symbol upload (Breakpad .sym / WASM source maps). Bearer QTCAAC_SYMBOL_UPLOAD_TOKEN. */
import { uploadSymbols } from '#lib/server/telemetry/symbols.js';

import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ request }) => uploadSymbols(request);
