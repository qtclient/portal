#!/usr/bin/env python3
"""Portal web local setup: bun install, .env from dist, prisma.

Usage:
  python3 apps/web/tools/setup/cli.py
  make setup
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
WEB = HERE.parents[1]
PORTAL = WEB.parents[1]


def main() -> int:
    if not (PORTAL / "package.json").is_file():
        print(f"[setup] missing {PORTAL}/package.json", file=sys.stderr)
        return 1

    subprocess.run(["bun", "install"], cwd=PORTAL, check=True)
    os.chdir(WEB)

    env_file = WEB / ".env"
    env_dist = WEB / ".env.dist"
    if not env_file.is_file():
        shutil.copy2(env_dist, env_file)
        print(f"[setup] wrote {env_file} from .env.dist")
    else:
        print("[setup] keeping existing .env (defaults live in .env.dist)")

    # Legacy WASM links; /play loads the tip via QTCAAC_ASSET_BASE (:9080).
    for legacy in (WEB / "static/wasm", WEB / "static/play"):
        if legacy.is_symlink() or legacy.is_file():
            legacy.unlink()
        elif legacy.is_dir():
            shutil.rmtree(legacy)

    subprocess.run(["bun", "x", "prisma", "generate"], check=False)
    print("[setup] done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
