#!/usr/bin/env python3
"""Regenerate the contract resource-cost tables in `docs/resource-costs.md`.

Why this exists
---------------
Soroban does not charge gas. It meters an invocation by resource -- CPU
instructions, memory, ledger entries read and written, the bytes behind them,
the events emitted, and *rent* on the entries the call leaves behind -- and
prices those separately. A change that makes a mint "simpler" can therefore cost
more, and a change that reads a few extra ledger entries can cost far more than
any amount of recomputation, because a ledger entry read is priced in the
thousands of stroops while a hundred thousand instructions cost about a
thousandth of that.

`contracts/benchmarks` measures each entry point against the real contracts and
prints one `RESOURCE ` line per invocation. This script runs those measurements
and rewrites the generated block in `docs/resource-costs.md`, so the numbers in
the documentation are the numbers the contracts produce rather than a snapshot
someone forgot to refresh.

Usage:
    python3 scripts/bench-contract-resources.py [--write]

Without `--write` the script checks the document instead of changing it, and
exits non-zero if the set of measured entry points no longer matches the tables.

The check is deliberately about *coverage*, not exact figures. Two reasons:

* The figures already have a regression gate. `contracts/benchmarks/tests/resources.rs`
  asserts an instruction and a ledger-write budget per entry point in CI, with
  enough headroom to absorb host-version noise. Repeating that as an exact
  string match would fail the build on a rounding difference and teach people
  to ignore it.
* What no other check catches is an entry point that exists but is missing from
  the tables. A reader who trusts the document would conclude the call is free
  of the costs the document exists to expose.

Numeric drift is still reported, so a run where the numbers moved is visible
without being fatal.
"""

from __future__ import annotations

import argparse
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
CONTRACTS_DIR = ROOT / "contracts"
DOC = ROOT / "docs" / "resource-costs.md"

BEGIN_MARKER = "<!-- BEGIN GENERATED: resource costs -->"
END_MARKER = "<!-- END GENERATED: resource costs -->"

# The order the contracts are documented in: the path a user takes through the
# system, not the alphabetical order of the directories.
CONTRACT_ORDER = ["nft", "collection", "royalty", "creator", "factory"]

CONTRACT_TITLES = {
    "nft": "NFT",
    "collection": "Collection",
    "royalty": "Royalty",
    "creator": "Creator",
    "factory": "Factory",
}

# Fields read from a `RESOURCE ` line, in the order they are printed.
FIELDS = [
    "instructions",
    "mem_bytes",
    "read_entries",
    "write_entries",
    "read_bytes",
    "write_bytes",
    "event_bytes",
    "fee_stroops",
    "fee_instructions",
    "fee_read_entries",
    "fee_write_entries",
    "fee_read_bytes",
    "fee_write_bytes",
    "fee_events",
    "rent_stroops",
]

# `cargo test` writes its own progress to the same stdout as the test, so the
# first `RESOURCE ` line of each test is prefixed by libtest's `test <name> ...`
# banner. The marker is therefore searched for anywhere in the line rather than
# anchored to the start, which is exactly the bug that silently dropped one entry
# point per test from the first version of this document.
RESOURCE_LINE = re.compile(r"RESOURCE (?P<name>.+?) instructions=-?\d+")

STROOPS_PER_XLM = 10_000_000


def run_benchmarks() -> dict[str, dict[str, int]]:
    """Run the measurement suite and return {entry point: {field: value}}."""
    # Two packages: the shared harness measures the four contracts it can link,
    # and the Factory measures itself from inside its own crate. The Factory is a
    # `cdylib`, so there is no way to reach it from the harness without growing
    # the deployed Wasm by 72%; see `contracts/benchmarks/src/lib.rs`.
    completed = subprocess.run(
        [
            "cargo",
            "test",
            "-p",
            "bezamint-benchmarks",
            "-p",
            "bezamint-factory",
            "--",
            "--nocapture",
            "--test-threads=1",
        ],
        cwd=CONTRACTS_DIR,
        capture_output=True,
        text=True,
    )

    # A budget assertion failing here is the point of the suite, so surface the
    # output rather than swallowing it into a confusing parse error.
    if completed.returncode != 0:
        sys.stderr.write(completed.stdout)
        sys.stderr.write(completed.stderr)
        raise SystemExit(
            "the benchmark suite failed; fix the budgets or the regression it "
            "caught before regenerating the documentation"
        )

    readings: dict[str, dict[str, int]] = {}
    for line in completed.stdout.splitlines():
        match = RESOURCE_LINE.search(line)
        if not match:
            continue
        name = match.group("name").strip()
        rest = line.split(" instructions=", 1)[1]
        values: dict[str, int] = {"instructions": int(rest.split()[0])}
        for field in FIELDS[1:]:
            found = re.search(rf"\b{field}=(-?\d+)", rest)
            if not found:
                raise SystemExit(f"RESOURCE line for {name!r} is missing {field}")
            values[field] = int(found.group(1))
        if name in readings:
            raise SystemExit(f"entry point {name!r} was measured twice")
        readings[name] = values

    if not readings:
        raise SystemExit("the benchmark suite produced no RESOURCE lines")
    return readings


def format_int(value: int) -> str:
    return f"{value:,}"


def format_xlm(stroops: int) -> str:
    """Stroops as XLM, to the precision the numbers actually justify."""
    xlm = stroops / STROOPS_PER_XLM
    if xlm == 0:
        return "0"
    if abs(xlm) < 1:
        return f"{xlm:.4f}"
    return f"{xlm:.3f}"


def group(readings: dict[str, dict[str, int]]) -> dict[str, list[str]]:
    grouped: dict[str, list[str]] = {}
    for name in readings:
        contract = name.split(".", 1)[0]
        if contract not in CONTRACT_TITLES:
            raise SystemExit(
                f"entry point {name!r} does not start with one of "
                f"{', '.join(CONTRACT_ORDER)}"
            )
        grouped.setdefault(contract, []).append(name)
    for names in grouped.values():
        names.sort()
    return grouped


def render(readings: dict[str, dict[str, int]]) -> str:
    grouped = group(readings)
    blocks: list[str] = []

    for contract in CONTRACT_ORDER:
        names = grouped.get(contract)
        if not names:
            continue
        rows = [
            "| Entry point | Instructions | Read entries | Write entries | "
            "Written bytes | Event bytes | Fee (XLM) | Rent (XLM) | "
            "Compute + I/O (XLM) |",
            "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
        ]
        for name in names:
            r = readings[name]
            net = r["fee_stroops"] - r["rent_stroops"]
            rows.append(
                f"| `{name}` "
                f"| {format_int(r['instructions'])} "
                f"| {format_int(r['read_entries'])} "
                f"| {format_int(r['write_entries'])} "
                f"| {format_int(r['write_bytes'])} "
                f"| {format_int(r['event_bytes'])} "
                f"| {format_xlm(r['fee_stroops'])} "
                f"| {format_xlm(r['rent_stroops'])} "
                f"| {format_xlm(net)} |"
            )

        blocks.append(f"### {CONTRACT_TITLES[contract]}\n")
        blocks.append("\n".join(rows))
        blocks.append("")

    # The fee-term breakdown answers the question the totals raise: which term
    # is the one worth attacking. It is summed per contract so a single call's
    # noise does not drive the reading.
    blocks.append("### Where the fee comes from\n")
    blocks.append(
        "Each contract's measured calls, summed across the entry points in its "
        "table above, split by the term that produced the fee. The remaining "
        "balance up to 100% is the per-entry read and write charges and the "
        "instruction charge.\n"
    )
    blocks.append(
        "| Contract | Instructions | Read entries | Write entries | Read bytes "
        "| Write bytes | Events | Rent | Total | Rent share |"
    )
    blocks.append(
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |"
    )
    for contract in CONTRACT_ORDER:
        names = grouped.get(contract)
        if not names:
            continue
        totals = {
            field: sum(readings[name][field] for name in names)
            for field in (
                "fee_instructions",
                "fee_read_entries",
                "fee_write_entries",
                "fee_read_bytes",
                "fee_write_bytes",
                "fee_events",
                "rent_stroops",
                "fee_stroops",
            )
        }
        rent_share = totals["rent_stroops"] / totals["fee_stroops"] * 100
        blocks.append(
            f"| {CONTRACT_TITLES[contract]} "
            f"| {format_int(totals['fee_instructions'])} "
            f"| {format_int(totals['fee_read_entries'])} "
            f"| {format_int(totals['fee_write_entries'])} "
            f"| {format_int(totals['fee_read_bytes'])} "
            f"| {format_int(totals['fee_write_bytes'])} "
            f"| {format_int(totals['fee_events'])} "
            f"| {format_xlm(totals['rent_stroops'])} "
            f"| {format_xlm(totals['fee_stroops'])} "
            f"| {rent_share:.1f}% |"
        )
    blocks.append("")

    return "\n".join(blocks).rstrip() + "\n"


def split_document(text: str) -> tuple[str, str, str]:
    start = text.find(BEGIN_MARKER)
    end = text.find(END_MARKER)
    if start == -1 or end == -1 or end < start:
        raise SystemExit(
            f"{DOC.relative_to(ROOT)} is missing the generated block markers:\n"
            f"  {BEGIN_MARKER}\n  {END_MARKER}"
        )
    return (
        text[: start + len(BEGIN_MARKER)],
        text[end:],
        text[start + len(BEGIN_MARKER) : end],
    )


def documented_names(existing: str) -> set[str]:
    return set(re.findall(r"^\| `([a-z]+\.[^`]+)`", existing, re.MULTILINE))


def reported_numbers(existing: str) -> dict[str, str]:
    """The first numeric column of each row, keyed by entry point."""
    found: dict[str, str] = {}
    for line in existing.splitlines():
        match = re.match(r"^\| `([a-z]+\.[^`]+)` \| ([0-9,]+) \|", line)
        if match:
            found[match.group(1)] = match.group(2)
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write",
        action="store_true",
        help="rewrite the document instead of checking it",
    )
    args = parser.parse_args()

    readings = run_benchmarks()
    generated = render(readings)

    document = DOC.read_text()
    head, tail, existing = split_document(document)

    if args.write:
        DOC.write_text(f"{head}\n{generated}{tail}")
        print(
            f"wrote {len(readings)} measurements to {DOC.relative_to(ROOT)}"
        )
        return 0

    expected = documented_names(generated)
    actual = documented_names(existing)

    missing = sorted(expected - actual)
    extra = sorted(actual - expected)

    if missing or extra:
        if missing:
            print(
                "these entry points are measured but missing from "
                f"{DOC.relative_to(ROOT)}:",
                file=sys.stderr,
            )
            for name in missing:
                print(f"  + {name}", file=sys.stderr)
        if extra:
            print(
                f"these rows in {DOC.relative_to(ROOT)} no longer correspond to "
                "a measurement:",
                file=sys.stderr,
            )
            for name in extra:
                print(f"  - {name}", file=sys.stderr)
        print(
            "\nRegenerate with: python3 scripts/bench-contract-resources.py --write",
            file=sys.stderr,
        )
        return 1

    # Numbers are not gated, but a moved number is worth saying out loud.
    before = reported_numbers(existing)
    after = reported_numbers(generated)
    drifted = [
        name
        for name in sorted(before)
        if name in after and before[name] != after[name]
    ]
    if drifted:
        print("instruction counts differ from the document (not a failure):")
        for name in drifted:
            print(f"  {name}: {before[name]} -> {after[name]}")
    print(f"{len(readings)} entry points documented; no missing or stale rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
