# Telemetry and privacy

This describes what a qtc-aac deployment stores when clients send telemetry.
Operators are responsible for disclosing it to their players.

| Data | Stored | Notes |
|------|--------|-------|
| Crash dump (minidump) | file under `QTCAAC_TELEMETRY_DIR` | process memory around the crash; the client asks before sending, and `ReportType=Minimal` keeps it small |
| Crash comment | database | free text the player typed |
| Browser crash | database + JSON file | error message, stack, boot stage, user agent |
| Account id | database | only when the sender has a website session |
| IP address | **not stored** | a salted SHA-256 hash (`QTCAAC_TELEMETRY_SALT`) for rate limiting / dedupe |
| FPS history | database | renderer, average/min/max FPS, anonymous client id |
| System survey | database | GPU, CPU, OS as reported by the client |

Everything is deleted after `QTCAAC_TELEMETRY_RETENTION_DAYS` (default 90).
`purgeAccountTelemetry(accountId)` removes an account's reports on request.
`QTCAAC_TELEMETRY_ENABLED=false` turns ingest off entirely.
