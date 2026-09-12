#!/usr/bin/env python3
"""Fail CI when a declared error code is not reachable from any source file.

Why this exists
---------------
The error catalogue in ``packages/shared/src/errors`` is easy to grow and easy to
inflate. A list of identifiers that nothing raises is documentation of an
intention, not of the system, and it is worse than a shorter list because it
makes the catalogue untrustworthy: a reader cannot tell which entries a caller
can actually meet.

This check is the anti-inflation rule. Every declared code must be referenced by
name from at least one non-test source file — a call site, a classification
table, a factory — with the declaration's own file excluded, so a code cannot
prove itself by existing. Protocol codes are referenced from the mapping table in
``protocol.ts``, which is where they are classified.

The remedy for a failure is never to add a pseudo-reference or to widen the
allowlist. It is one of:

* wire the code at the site that can produce the failure, or
* delete the code, because the failure it described is not reachable.

Usage
-----
    scripts/check-error-codes.py            # verify
    scripts/check-error-codes.py --list     # print every code and its references
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
SHARED_ERRORS = ROOT_DIR / "packages" / "shared" / "src" / "errors"
CODES_FILE = SHARED_ERRORS / "codes.ts"
PROTOCOL_FILE = SHARED_ERRORS / "protocol.ts"

# Source trees searched for a reference. Tests are included deliberately: a code
# that only a test names is still not a code the application can raise, so tests
# are excluded from *proving* a code and this list omits them entirely.
SEARCH_ROOTS = ("apps/web/src", "packages/shared/src", "scripts", "contracts")

SEARCH_SUFFIXES = (".ts", ".tsx", ".py", ".rs")

# Files whose contents are the declaration itself and therefore prove nothing.
DECLARATION_FILES = {CODES_FILE.resolve(), PROTOCOL_FILE.resolve()}

ROW = re.compile(r"^\s*\['([A-Z][A-Z0-9_]+)',", re.M)
PROTOCOL_NAME = re.compile(r"^\s*name: '([A-Z][A-Z0-9_]+)',", re.M)


def declared_codes() -> dict[str, str]:
    """Every declared code, mapped to the file that declares it.

    Protocol codes are excluded: their declaration in ``PROTOCOL_ROWS`` *is* the
    classification, so the table proves itself. What keeps them honest is a
    different check — ``errors.test.ts`` asserts every member of the SDK's
    protocol enums is either classified there or explicitly ignored.
    """
    codes: dict[str, str] = {}
    for name in ROW.findall(CODES_FILE.read_text()):
        codes[name] = str(CODES_FILE.relative_to(ROOT_DIR))
    return codes


def source_files() -> list[Path]:
    files: list[Path] = []
    for root in SEARCH_ROOTS:
        base = ROOT_DIR / root
        if not base.is_dir():
            continue
        for path in base.rglob("*"):
            if not path.is_file() or path.suffix not in SEARCH_SUFFIXES:
                continue
            if "node_modules" in path.parts or path.resolve() in DECLARATION_FILES:
                continue
            files.append(path)
    return files


def references(codes: dict[str, str]) -> dict[str, list[str]]:
    """For each code, the files that reference it by name."""
    found: dict[str, list[str]] = {code: [] for code in codes}
    # A word-boundary match, so `BAD_REQUEST` does not count as a reference to
    # `REQUEST` and `TX_RESULT_FAILED` does not count for `TX_RESULT`.
    patterns = {code: re.compile(rf"\b{re.escape(code)}\b") for code in codes}

    for path in source_files():
        try:
            text = path.read_text()
        except (UnicodeDecodeError, OSError):
            continue
        for code, pattern in patterns.items():
            if pattern.search(text):
                found[code].append(str(path.relative_to(ROOT_DIR)))
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--list",
        action="store_true",
        help="print every code with its referencing files instead of verifying",
    )
    args = parser.parse_args()

    codes = declared_codes()
    found = references(codes)

    if args.list:
        print(json.dumps({code: found[code] for code in sorted(codes)}, indent=2))
        return 0

    orphaned = sorted(code for code in codes if not found[code])

    if orphaned:
        print(
            f"error: {len(orphaned)} of {len(codes)} declared error codes are not "
            "referenced by any source file.",
            file=sys.stderr,
        )
        print(
            "\nEach one is either a failure that should be raised somewhere, or a\n"
            "failure that is not reachable and should be deleted. Do not add a\n"
            "reference that does not raise it.\n",
            file=sys.stderr,
        )
        for code in orphaned:
            print(f"  - {code} (declared in {codes[code]})", file=sys.stderr)
        return 1

    print(f"All {len(codes)} declared error codes are referenced by source.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
