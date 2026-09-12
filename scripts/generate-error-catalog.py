#!/usr/bin/env python3
"""Generate the contract error catalog from the Rust sources.

Why this exists
---------------
Every contract returns typed numeric codes (``Error(Contract, #12)``) rather than
formatted panic strings, so a caller can branch on the failure instead of
string-matching a message. That only pays off if the numbers are documented
somewhere an integrator can find them, and if the documentation cannot drift away
from the source.

A hand-written table drifts the first time somebody adds a variant and forgets
the table. This script makes the Rust enum the single source of truth: it reads
each contract's ``#[contracterror]`` enum and writes two artifacts.

* ``docs/error-codes.md`` — the human reference, one table per contract, with the
  doc comment as the meaning and the functions that can raise each code.
* ``apps/web/src/lib/contractErrors.ts`` — the same data as a typed TypeScript
  catalog, so the web app can turn a bare integer back into a name and a meaning
  without a second hand-maintained copy.

Both files carry a generated header and are listed in ``.prettierignore``: the
generator is the formatter for them, and the check mode below is the gate. A
change to a contract's error enum therefore fails CI until the catalog is
regenerated in the same commit.

Usage
-----
    scripts/generate-error-catalog.py            # verify the committed catalog
    scripts/generate-error-catalog.py --write    # regenerate after a review

The check mode compares the committed files with a fresh rendering, so it is
exact: whitespace and ordering are part of the contract.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
CONTRACTS_DIR = ROOT_DIR / "contracts"
DOC_PATH = ROOT_DIR / "docs" / "error-codes.md"
TS_PATH = ROOT_DIR / "apps" / "web" / "src" / "lib" / "contractErrors.ts"

# Contract order matches `CONTRACT_IDS` in apps/web/src/services/contracts.ts and
# the `checks.contracts` object in /api/health, so the three stay comparable.
CONTRACTS: tuple[str, ...] = ("nft", "collection", "royalty", "creator", "factory")

VARIANT_RE = re.compile(r"^\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*(\d+)\s*,?\s*$")
FN_RE = re.compile(r"^\s*(?:pub\s+)?fn\s+([a-z_][a-z0-9_]*)\s*[(<]")
# `/// [\`MAX_SUPPLY\`] has been reached.` -> `\`MAX_SUPPLY\` has been reached.`
# Rustdoc intra-doc links are noise in a plain-text table, and the constant name
# is the useful part.
RUSTDOC_LINK_RE = re.compile(r"\[([^\]]+)\]")

GENERATED_WARNING_MD = (
    "<!-- GENERATED FILE - do not edit by hand.\n"
    "     Source: the #[contracterror] enum in contracts/<name>/src/lib.rs\n"
    "     Generator: scripts/generate-error-catalog.py\n"
    "     Regenerate: pnpm run contract:errors\n"
    "     CI verifies this file with: pnpm run contract:errors:check -->"
)

GENERATED_WARNING_TS = """/**
 * GENERATED FILE - do not edit by hand.
 *
 * Source: the #[contracterror] enum in contracts/<name>/src/lib.rs
 * Generator: scripts/generate-error-catalog.py
 * Regenerate: pnpm run contract:errors
 * CI verifies this file with: pnpm run contract:errors:check
 *
 * Every BezaMint contract raises typed numeric codes rather than panic strings,
 * so a failed call surfaces as `Error(Contract, #N)` with no name attached. This
 * catalog restores the name and the documented meaning for a bare integer, which
 * is what lets `normalizeError` turn an opaque host error into something a
 * caller can branch on. It is generated from the Rust enums so it cannot drift.
 *
 * Both this file and docs/error-codes.md are listed in `.prettierignore`: the
 * generator is their formatter, and `contract:errors:check` compares its output
 * with what is committed, byte for byte.
 */"""


class ContractError(Exception):
    """A contract source that could not be parsed as expected."""


def clean_doc(lines: list[str]) -> str:
    """Join Rust doc-comment lines into a single readable sentence."""
    parts = []
    for raw in lines:
        text = raw.strip()
        if text.startswith("///"):
            text = text[3:].strip()
        if text:
            parts.append(text)
    if not parts:
        return ""
    sentence = " ".join(parts)
    sentence = RUSTDOC_LINK_RE.sub(r"\1", sentence)
    return re.sub(r"\s+", " ", sentence).strip()


def parse_source(path: Path) -> tuple[str, dict[int, dict[str, object]]]:
    """Extract the `#[contracterror]` enum from one contract's lib.rs.

    Returns the enum name and a mapping of code -> {variant, meaning, raisedBy}.
    """
    text = path.read_text(encoding="utf-8")
    lines = text.splitlines()

    if "#[contracterror]" not in text:
        raise ContractError(f"{path} has no #[contracterror] enum")

    # ── the enum ──────────────────────────────────────────────────────────────
    enum_name = None
    start = None
    for index, line in enumerate(lines):
        if line.strip() == "#[contracterror]":
            for probe in range(index, min(index + 12, len(lines))):
                match = re.match(r"pub enum ([A-Za-z][A-Za-z0-9_]*)", lines[probe])
                if match:
                    enum_name = match.group(1)
                    start = probe + 1
                    break
            break
    if enum_name is None or start is None:
        raise ContractError(f"{path} declares #[contracterror] but no `pub enum` follows it")

    codes: dict[int, dict[str, object]] = {}
    pending_doc: list[str] = []
    index = start
    while index < len(lines):
        line = lines[index]
        if line.startswith("}"):
            break
        stripped = line.strip()
        if stripped.startswith("///"):
            pending_doc.append(stripped)
            index += 1
            continue
        if stripped.startswith("#[") or not stripped:
            index += 1
            continue
        match = VARIANT_RE.match(line)
        if match:
            variant, code = match.group(1), int(match.group(2))
            if code in codes:
                raise ContractError(f"{path}: code #{code} is declared twice")
            codes[code] = {
                "variant": variant,
                "meaning": clean_doc(pending_doc),
                "raisedBy": [],
            }
            pending_doc = []
        index += 1

    if not codes:
        raise ContractError(f"{path}: enum {enum_name} has no variants")

    # ── which functions raise each code ───────────────────────────────────────
    ref_re = re.compile(rf"\b{re.escape(enum_name)}::([A-Za-z][A-Za-z0-9_]*)")
    by_variant = {str(entry["variant"]): code for code, entry in codes.items()}

    current_fn: str | None = None
    depth = 0
    opened = False
    for line in lines:
        if current_fn is None:
            match = FN_RE.match(line)
            if not match:
                continue
            current_fn = match.group(1)
            depth = 0
            opened = False
            # The signature line is scanned below as well: a one-line
            # `pub fn mint(...) {` carries the opening brace that closes the
            # function, and skipping it made the first inner block look like the
            # end of the body — which silently dropped every raise after it.

        for variant in ref_re.findall(line):
            code = by_variant.get(variant)
            if code is None:
                raise ContractError(f"{path}: raised {enum_name}::{variant}, which is not declared")
            raised = codes[code]["raisedBy"]  # type: ignore[assignment]
            if current_fn not in raised:  # type: ignore[operator]
                raised.append(current_fn)  # type: ignore[union-attr]

        depth += line.count("{") - line.count("}")
        if "{" in line:
            opened = True
        if opened and depth <= 0:
            current_fn = None

    for entry in codes.values():
        entry["raisedBy"] = sorted(entry["raisedBy"])  # type: ignore[arg-type]

    return enum_name, codes


def render_markdown(catalog: dict[str, tuple[str, dict[int, dict[str, object]]]]) -> str:
    total = sum(len(codes) for _, codes in catalog.values())

    out: list[str] = []
    out.append("# BezaMint Contract Error Codes")
    out.append("")
    out.append(GENERATED_WARNING_MD)
    out.append("")
    out.append(
        f"Every BezaMint contract raises typed numeric codes instead of formatted panic\n"
        f"strings. When a contract call fails, the Soroban host reports it as\n"
        f"`Error(Contract, #N)` — an integer with no name attached. This page maps each\n"
        f"integer back to its variant, what it means, and which functions can raise it.\n"
        f"**{total} codes** are in use across the five contracts."
    )
    out.append("")
    out.append("## Decoding a failure")
    out.append("")
    out.append(
        "A simulation or submission failure carries the code in the error text. The same\n"
        "integer means different things in different contracts, so the contract that was\n"
        "called is part of the answer:"
    )
    out.append("")
    out.append("```text")
    out.append("HostError: Error(Contract, #12)")
    out.append("                       │")
    out.append("                       └── contract-specific code; see the tables below")
    out.append("```")
    out.append("")
    out.append(
        "The web application parses this into a structured value: `normalizeError`\n"
        "attaches `details.contractError = { code, contract, variant, meaning }` whenever\n"
        "the message carries an `Error(Contract, #N)`. `variant` and `meaning` are `null`\n"
        "when the code is unknown to the catalog (a contract deployed ahead of the web\n"
        "app, for example), and the numeric `code` is still reported. The TypeScript side\n"
        "of this catalog lives in `apps/web/src/lib/contractErrors.ts`, generated from the\n"
        "same source as this page."
    )
    out.append("")
    out.append("Codes are **per contract**, not global: `#1` is `NotInitialized` everywhere\n")
    out.append("by convention, but nothing enforces that across enums.")
    out.append("")
    out.append("## Summary")
    out.append("")
    out.append("| Contract | Enum | Codes | Range |")
    out.append("| -------- | ---- | ----- | ----- |")
    for name in CONTRACTS:
        enum_name, codes = catalog[name]
        numbers = sorted(codes)
        out.append(f"| {name} | `{enum_name}` | {len(codes)} | {numbers[0]}–{numbers[-1]} |")
    out.append("")

    for name in CONTRACTS:
        enum_name, codes = catalog[name]
        out.append(f"## `{name}` — `{enum_name}`")
        out.append("")
        out.append(f"{len(codes)} codes.")
        out.append("")
        out.append("| Code | Variant | Raised by | Meaning |")
        out.append("| ---- | ------- | --------- | ------- |")
        for code in sorted(codes):
            entry = codes[code]
            raised = entry["raisedBy"] or []
            raised_text = ", ".join(f"`{fn}`" for fn in raised) if raised else "—"
            meaning = entry["meaning"] or "—"
            out.append(f"| {code} | `{entry['variant']}` | {raised_text} | {meaning} |")
        out.append("")

    out.append("## Editing this catalog")
    out.append("")
    out.append("Do not edit this file directly. Add or change the variant's doc comment in\n")
    out.append("`contracts/<name>/src/lib.rs`, then run:")
    out.append("")
    out.append("```bash")
    out.append("pnpm run contract:errors")
    out.append("```")
    out.append("")
    out.append(
        "`pnpm run contract:errors:check` runs in CI and fails if the committed catalog\n"
        "does not match the contracts, so a new code cannot land undocumented."
    )
    out.append("")
    return "\n".join(out)


def ts_string(value: str) -> str:
    return "'" + value.replace("\\", "\\\\").replace("'", "\\'") + "'"


def render_typescript(catalog: dict[str, tuple[str, dict[int, dict[str, object]]]]) -> str:
    total = sum(len(codes) for _, codes in catalog.values())

    out: list[str] = []
    out.append(GENERATED_WARNING_TS)
    out.append("")
    out.append("export const CONTRACT_NAMES = [")
    for name in CONTRACTS:
        out.append(f"  {ts_string(name)},")
    out.append("] as const;")
    out.append("")
    out.append("export type ContractName = (typeof CONTRACT_NAMES)[number];")
    out.append("")
    out.append("export interface ContractErrorDescriptor {")
    out.append("  /** Numeric code as reported by the host in `Error(Contract, #N)`. */")
    out.append("  readonly code: number;")
    out.append("  /** Rust enum variant name. */")
    out.append("  readonly variant: string;")
    out.append("  /** One-line description, taken from the variant's Rust doc comment. */")
    out.append("  readonly meaning: string;")
    out.append("  /** Contract functions that can raise this code, in source order. */")
    out.append("  readonly raisedBy: readonly string[];")
    out.append("}")
    out.append("")
    out.append("/** The Rust enum each contract's codes come from. */")
    out.append("export const CONTRACT_ERROR_ENUMS = {")
    for name in CONTRACTS:
        enum_name, _ = catalog[name]
        out.append(f"  {name}: {ts_string(enum_name)},")
    out.append("} as const satisfies Record<ContractName, string>;")
    out.append("")
    out.append("/** Every code, keyed by contract and then by numeric code. */")
    out.append("export const CONTRACT_ERRORS = {")
    for name in CONTRACTS:
        _, codes = catalog[name]
        out.append(f"  {name}: {{")
        for code in sorted(codes):
            entry = codes[code]
            raised = ", ".join(ts_string(fn) for fn in entry["raisedBy"])  # type: ignore[union-attr]
            meaning = ts_string(str(entry["meaning"])) if entry["meaning"] else "''"
            out.append(f"    {code}: {{")
            out.append(f"      code: {code},")
            out.append(f"      variant: {ts_string(str(entry['variant']))},")
            out.append(f"      meaning: {meaning},")
            out.append(f"      raisedBy: [{raised}],")
            out.append("    },")
        out.append("  },")
    out.append("} as const satisfies Record<ContractName, Record<number, ContractErrorDescriptor>>;")
    out.append("")
    out.append(f"/** Total number of codes across every contract ({total}). */")
    out.append(f"export const CONTRACT_ERROR_CODE_COUNT = {total};")
    out.append("")
    out.append("/**")
    out.append(" * Look up a code within one contract.")
    out.append(" *")
    out.append(" * Returns `null` for a code the catalog does not know — a contract deployed")
    out.append(" * ahead of this build, or a host error that is not a contract error at all.")
    out.append(" * Callers get the numeric code either way; the lookup only adds the name.")
    out.append(" */")
    out.append("export function describeContractError(")
    out.append("  contract: ContractName,")
    out.append("  code: number,")
    out.append("): ContractErrorDescriptor | null {")
    out.append("  const table: Record<number, ContractErrorDescriptor> =")
    out.append("    CONTRACT_ERRORS[contract];")
    out.append("  return table[code] ?? null;")
    out.append("}")
    out.append("")
    return "\n".join(out)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--write",
        action="store_true",
        help="write the catalog files instead of verifying them",
    )
    args = parser.parse_args()

    catalog: dict[str, tuple[str, dict[int, dict[str, object]]]] = {}
    for name in CONTRACTS:
        source = CONTRACTS_DIR / name / "src" / "lib.rs"
        if not source.is_file():
            print(f"error: {source} not found", file=sys.stderr)
            return 1
        try:
            catalog[name] = parse_source(source)
        except ContractError as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1

    rendered = {
        DOC_PATH: render_markdown(catalog),
        TS_PATH: render_typescript(catalog),
    }

    if args.write:
        for path, content in rendered.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
            print(f"wrote {path.relative_to(ROOT_DIR)}")
        return 0

    drifted = []
    for path, content in rendered.items():
        rel = path.relative_to(ROOT_DIR)
        if not path.is_file():
            print(f"error: {rel} is missing; run `pnpm run contract:errors`", file=sys.stderr)
            drifted.append(rel)
            continue
        if path.read_text(encoding="utf-8") != content:
            print(f"error: {rel} does not match the contracts", file=sys.stderr)
            drifted.append(rel)

    if drifted:
        print(
            "\nThe contract error catalog is out of date. Regenerate it with:\n"
            "    pnpm run contract:errors",
            file=sys.stderr,
        )
        return 1

    total = sum(len(codes) for _, codes in catalog.values())
    print(f"error catalog matches the contracts ({total} codes across {len(catalog)} contracts)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
