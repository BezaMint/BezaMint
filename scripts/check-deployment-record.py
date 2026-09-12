#!/usr/bin/env python3
"""Keep the published deployment registry and the documents that quote it in step.

Why this exists
---------------
``docs/mainnet-readiness.md`` requires a published address registry per network
with the deployment commit and the wasm hashes, so a reader can verify that the
frontend points at the contracts it claims. ``deployments/testnet.json`` is that
registry, and ``scripts/verify-deploy.sh`` proves the reachability and wiring half
of the claim against the chain.

What neither of those does is notice when the registry stops matching the
documents. The contract addresses are quoted in three places that are edited by
hand -- the README's contract table, the README's environment block, and the hash
record the seed script writes into ``demo/seed-manifest.json`` -- and a
redeployment that updates the registry but forgets one of them leaves the project
advertising a contract set that no part of the code uses. That is exactly the
failure this repository already fixed once by hand, so it is worth a gate: the
same reasoning as the ABI snapshot, the error catalog and the demo metadata.

Nothing here touches the network. Reachability is ``scripts/verify-deploy.sh``'s
job and needs a funded key; this check is about internal consistency, so it can
run anywhere CI runs.

Usage
-----
    scripts/check-deployment-record.py                 # verify
    scripts/check-deployment-record.py --network testnet
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
REGISTRY_DIR = ROOT_DIR / "deployments"
README = ROOT_DIR / "README.md"

# The five contracts every deployment must publish, in the order the README
# table and the seed script both use.
CONTRACT_NAMES = ("nft", "collection", "royalty", "creator", "factory")

# The seed manifest only records the three contracts the seed script touches.
SEEDED_CONTRACT_NAMES = ("factory", "collection", "nft")

CONTRACT_ID = re.compile(r"^C[A-Z0-9]{55}$")
ACCOUNT_ID = re.compile(r"^G[A-Z0-9]{55}$")
WASM_HASH = re.compile(r"^[0-9a-f]{64}$")
COMMIT_SHA = re.compile(r"^[0-9a-f]{40}$")
ISO_8601 = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$")

# Any contract address in the README, used to catch one left behind by a
# previous deployment rather than merely checking the new ones are present.
ANY_CONTRACT_ID = re.compile(r"\bC[A-Z0-9]{55}\b")


def load_json(path: Path, failures: list[str]) -> dict | None:
    if not path.exists():
        failures.append(f"{path.relative_to(ROOT_DIR)}: file does not exist")
        return None
    try:
        return json.loads(path.read_text(encoding="utf8"))
    except json.JSONDecodeError as error:
        failures.append(f"{path.relative_to(ROOT_DIR)}: invalid JSON ({error})")
        return None


def check_registry(registry: dict, failures: list[str]) -> None:
    for key in ("network", "rpcUrl", "explorer", "deployedAt", "sourceCommit", "deployer"):
        if key not in registry:
            failures.append(f"registry: missing required key '{key}'")

    for key in ("deployedAt", "verifiedAt"):
        value = registry.get(key)
        if value is not None and not ISO_8601.match(str(value)):
            failures.append(f"registry.{key}: '{value}' is not an ISO-8601 UTC timestamp")

    commit = registry.get("sourceCommit", "")
    if not COMMIT_SHA.match(str(commit)):
        failures.append(
            f"registry.sourceCommit: '{commit}' is not a 40-character commit sha,"
            " so the wasm an operator builds cannot be traced to the code that produced it"
        )

    deployer = registry.get("deployer") or {}
    address = deployer.get("address", "")
    if not ACCOUNT_ID.match(str(address)):
        failures.append(f"registry.deployer.address: '{address}' is not a Stellar account id")

    contracts = registry.get("contracts")
    if not isinstance(contracts, dict):
        failures.append("registry.contracts: missing or not an object")
        return

    missing = set(CONTRACT_NAMES) - set(contracts)
    extra = set(contracts) - set(CONTRACT_NAMES)
    for name in sorted(missing):
        failures.append(f"registry.contracts.{name}: not published")
    for name in sorted(extra):
        failures.append(f"registry.contracts.{name}: unknown contract name")

    for name in CONTRACT_NAMES:
        entry = contracts.get(name)
        if not isinstance(entry, dict):
            continue
        contract_id = entry.get("id", "")
        if not CONTRACT_ID.match(str(contract_id)):
            failures.append(f"registry.contracts.{name}.id: '{contract_id}' is not a contract id")
        wasm = entry.get("wasmHash", "")
        if not WASM_HASH.match(str(wasm)):
            failures.append(
                f"registry.contracts.{name}.wasmHash: '{wasm}' is not a 32-byte sha256"
                " (lowercase hex), so an upgrade cannot be checked against it"
            )
        created = entry.get("createdAt")
        if created is not None and not ISO_8601.match(str(created)):
            failures.append(f"registry.contracts.{name}.createdAt: '{created}' is not ISO-8601")

    # The whole point of the Factory hand-off is that the Royalty admin is the
    # Factory; the registry states which address that is, so it has to agree with
    # the Factory it publishes.
    factory_id = (contracts.get("factory") or {}).get("id")
    royalty_admin = (registry.get("wiring") or {}).get("royaltyAdmin")
    if royalty_admin != factory_id:
        failures.append(
            "registry.wiring.royaltyAdmin: expected the published Factory address"
            f" '{factory_id}', found '{royalty_admin}'"
        )


def check_readme(registry: dict, failures: list[str]) -> None:
    if not README.exists():
        failures.append("README.md: file does not exist")
        return

    text = README.read_text(encoding="utf8")
    contracts = registry.get("contracts") or {}

    published = {
        (contracts.get(name) or {}).get("id")
        for name in CONTRACT_NAMES
        if (contracts.get(name) or {}).get("id")
    }

    for name in CONTRACT_NAMES:
        contract_id = (contracts.get(name) or {}).get("id")
        if not contract_id:
            continue
        variable = f"NEXT_PUBLIC_{name.upper()}_CONTRACT_ID"
        if f"{variable}={contract_id}" not in text:
            failures.append(f"README.md: environment block does not set {variable}={contract_id}")
        if contract_id not in text:
            failures.append(f"README.md: {name} address {contract_id} is not quoted anywhere")

    # A stale address is worse than a missing one: it looks like a live contract.
    for found in sorted(set(ANY_CONTRACT_ID.findall(text)) - published):
        failures.append(
            f"README.md: quotes contract address {found}, which is not in"
            " deployments/testnet.json (left over from a previous deployment?)"
        )

    deployer = (registry.get("deployer") or {}).get("address")
    if deployer and deployer not in text:
        failures.append(f"README.md: deployer address {deployer} is not linked")


def check_seed_manifest(registry: dict, failures: list[str]) -> None:
    manifest_path = ROOT_DIR / str(registry.get("seedManifest") or "demo/seed-manifest.json")
    manifest = load_json(manifest_path, failures)
    if manifest is None:
        return

    contracts = registry.get("contracts") or {}
    seeded = manifest.get("contracts") or {}

    for name in SEEDED_CONTRACT_NAMES:
        expected = (contracts.get(name) or {}).get("id")
        actual = seeded.get(name)
        if expected != actual:
            failures.append(
                f"{manifest_path.relative_to(ROOT_DIR)}: contracts.{name} is '{actual}',"
                f" but the registry publishes '{expected}'"
            )

    if manifest.get("network") != registry.get("network"):
        failures.append(
            f"{manifest_path.relative_to(ROOT_DIR)}: network is '{manifest.get('network')}',"
            f" but the registry publishes '{registry.get('network')}'"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--network",
        default="testnet",
        help="registry to check (default: testnet)",
    )
    args = parser.parse_args()

    path = REGISTRY_DIR / f"{args.network}.json"
    failures: list[str] = []

    registry = load_json(path, failures)
    if registry is None:
        print("Deployment record check failed:\n", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        return 1

    check_registry(registry, failures)
    check_readme(registry, failures)
    check_seed_manifest(registry, failures)

    if failures:
        print("Deployment record check failed:\n", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        print(
            "\nUpdate deployments/"
            f"{args.network}.json, the README's contract table and environment"
            "\nblock, and (by re-running scripts/seed-testnet-activity.sh) the seed"
            "\nmanifest so all three describe the same deployment.\n",
            file=sys.stderr,
        )
        return 1

    print(
        f"Deployment record matches the README and the seed manifest"
        f" ({len(CONTRACT_NAMES)} contracts on {args.network})."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
