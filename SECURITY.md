# Security

Please report vulnerabilities privately through
[GitHub security advisories](https://github.com/qtclient/qtc-aac/security/advisories/new)
rather than public issues. Include the affected version or commit, steps to
reproduce and the impact you observed. We aim to acknowledge reports within a
few days.

Operators: keep `QTCAAC_SYMBOL_UPLOAD_TOKEN` and `QTCAAC_TELEMETRY_SALT`
secret, mount `QTCAAC_TELEMETRY_DIR` on a private volume, and do not expose
the database port publicly.
