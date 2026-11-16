/** Resolved pack config (works on server and client). */
import packConfig from '$pack/config';

import { resolvePackConfig } from '#lib/pack-api.js';

export const pack = resolvePackConfig(packConfig);
