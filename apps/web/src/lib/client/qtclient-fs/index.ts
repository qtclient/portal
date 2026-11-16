export {
	attachQtclientFsToModule,
	createQtclientFsSyncBridge,
	releaseQtclientFsHandlesForPortalWrites,
	QtclientFsOpen,
	type QtclientFsSyncApi,
} from './sync-bridge.js';
export {
	QTCLIENT_FS_DATA,
	QTCLIENT_FS_HOME,
	QTCLIENT_FS_MODS,
	absQtclientFsPath,
	isQtclientFsPath,
	opfsRelFromQtclientAbs,
} from './paths.js';
