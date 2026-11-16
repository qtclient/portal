# Client telemetry

| Endpoint | Sender | Payload |
|----------|--------|---------|
| `POST /clientservices/crashreceiver.php` | desktop client (`crashReportUrl`) | `multipart/form-data`: Breakpad minidump (`upload_file_minidump`, or the largest file part) + text fields `Comment`, `ReportType` (`Full` \| `Minimal`), optional `platform`, `revision`/`ver`. Raw `application/octet-stream` also accepted (fields in the query string). |
| `POST /api/telemetry/crash` | `/play` | JSON `{ name, message, stack, stage, revision, userAgent }` |
| `POST /clientservices/hardwarereceiver.php` | client (`fpsHistoryRecipient`) | JSON object or array. `dataType: "FPSHistory"` entries: `clientID`, `renderer`, `timeStamp` (`yyyy-MM-dd hh:mm:ss,zzz`), `averageFPS`, `minFPS`, `maxFPS`. Other objects are stored as system surveys. |
| `POST /api/telemetry/symbols` | CI | `Authorization: Bearer $QTCAAC_SYMBOL_UPLOAD_TOKEN`, multipart `file`: Breakpad `.sym`, or a WASM source map (`*.wasm.map`) plus a `revision` field |

The client revision comes from `X-Tibia-Client` / `X-Qtclient-Revision` or the
payload. These endpoints are exempt from the form-origin CSRF check (native
clients send no `Origin`); symbol upload is token-protected.

## Processing

1. The upload is validated (size cap, `MDMP` magic, rate limit per IP) and
   stored under `QTCAAC_TELEMETRY_DIR/dumps/YYYY/MM/DD/`.
2. A serial worker symbolicates it:
   - minidumps with [`minidump-stackwalk`](https://github.com/rust-minidump/rust-minidump)
     against the Breakpad symbol store `QTCAAC_TELEMETRY_DIR/symbols/<module>/<debug id>/<module>.sym`
     (the Docker image ships the x86_64 binary);
   - browser stacks by parsing V8/SpiderMonkey/JSC frames and mapping
     `wasm-function[...]:0x…` offsets through the uploaded source map
     (Emscripten `-gsource-map`).
3. The top meaningful frames give a signature; reports with the same signature
   form a crash group. A resolved group reopens when it crashes again.
4. Uploading symbols re-queues recent unsymbolicated reports, so early crashes
   get readable stacks once CI catches up.

Admin views: `/admin/crashes` (groups, stacks, resolve/notes, re-symbolicate)
and `/admin/telemetry` (FPS per revision/renderer, GPUs, crashes per platform).
A pack `telemetry` hook can forward events to another system.

## Settings

| Variable | Default | |
|----------|---------|---|
| `QTCAAC_TELEMETRY_ENABLED` | `true` | `false` accepts and drops everything |
| `QTCAAC_TELEMETRY_DIR` | `data/telemetry` | mount a volume in production |
| `QTCAAC_TELEMETRY_RETENTION_DAYS` | `90` | reports, dumps, FPS and surveys |
| `QTCAAC_TELEMETRY_SALT` | empty | salt for stored IP hashes |
| `QTCAAC_CRASH_MAX_BYTES` | 32 MiB | per crash upload |
| `QTCAAC_SYMBOL_MAX_BYTES` | 512 MiB | per symbol upload |
| `QTCAAC_SYMBOL_UPLOAD_TOKEN` | empty | empty disables symbol upload |
| `QTCAAC_MINIDUMP_STACKWALK` | `minidump-stackwalk` | binary path |
| `BODY_SIZE_LIMIT` | `600M` in the image | adapter-node request cap |

## Uploading symbols from CI

```bash
dump_syms build/client > client.sym      # Breakpad tools / rust dump_syms
curl -fsS -H "Authorization: Bearer $TOKEN" -F file=@client.sym \
  https://www.example.com/api/telemetry/symbols
curl -fsS -H "Authorization: Bearer $TOKEN" -F revision=$REV -F file=@tibia.wasm.map \
  https://www.example.com/api/telemetry/symbols
```
