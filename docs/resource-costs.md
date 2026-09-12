# Contract resource costs

What each BezaMint contract entry point costs to invoke, measured against the
real contracts rather than estimated from the source.

Soroban has no gas. It meters an invocation by **resource** and prices each
resource separately, so "cheaper" is not one number:

| Term                  | Priced per           | Rate (pubnet snapshot) |
| --------------------- | -------------------- | ---------------------- |
| CPU instructions      | 10,000 instructions  | 25 stroops             |
| Ledger entry read     | entry                | 6,250 stroops          |
| Ledger entry write    | entry                | 10,000 stroops         |
| Ledger read           | KiB                  | 1,786 stroops          |
| Ledger write          | KiB                  | 12,000 stroops         |
| Contract event        | KiB                  | 10,000 stroops         |
| Persistent entry rent | KiB x ledger, / 2103 | 12,000 stroops         |

The consequence that matters when reading anything below: **a ledger entry read
costs as much as 2.5 million instructions**, and a single write costs as much as
4 million. Recomputing a value is almost always cheaper than storing it, and
reading three entries is always more expensive than reading one.

Rent is charged when a call extends the time-to-live of the persistent entries
it touches. The contracts bump TTL to the network maximum, so a call that
creates entries pays a year of rent for them up front, and a call that rewrites
entries it already extended pays nothing extra. Rent is the largest term for
almost every entry point here, which is why it is a column of its own rather
than folded into the total.

## Reproducing

```bash
pnpm run contract:bench          # measure and rewrite this document
pnpm run contract:bench:check    # fail if an entry point is missing from it
```

The measurements live in `contracts/benchmarks/tests/resources.rs`. That suite
also asserts an instruction and ledger-write budget per entry point, so a change
that makes a hot path more expensive fails CI rather than this document going
quietly stale.

## How to read the numbers

- **They are relative, not absolute.** The contracts run natively here, not as
  Wasm, so instruction counts are underestimated, and the SDK does not model
  transaction size or signature verification at all. `mock_all_auths` is used
  throughout. Compare entry points against each other, and against the same
  entry point before and after a change; do not quote a figure as the mainnet
  fee for a transaction.
- **The rates are a snapshot.** The SDK prices resources with pubnet rates
  captured on 2024-12-11. Fee rates are governance parameters and change.
- **Rent assumes the entries are new.** The benchmark ledger does not advance,
  so the first write to an entry pays a full TTL extension and every later write
  to it is a no-op. That is the shape of a first mint or a first collection, and
  it is the expensive case; a rewrite of an entry whose TTL is already at the
  maximum correctly costs nothing.
- **Some costs depend on the data, not the code.** The NFT contract keeps each
  owner's token ids in one vector and the Collection contract keeps its
  membership in one vector, and both rewrite the whole vector on every change.
  Membership and burn are therefore measured at a stated size, and the size is
  part of the entry point's name. A benchmark of the empty case would report the
  cheapest possible answer.
- **XLM columns are stroops / 10,000,000.** Fees are reported to four decimals,
  which is the precision the underlying estimate supports.

<!-- BEGIN GENERATED: resource costs -->

### NFT

| Entry point                        | Instructions | Read entries | Write entries | Written bytes | Event bytes | Fee (XLM) | Rent (XLM) | Compute + I/O (XLM) |
| ---------------------------------- | -----------: | -----------: | ------------: | ------------: | ----------: | --------: | ---------: | ------------------: |
| `nft.approve`                      |       80,258 |            3 |             2 |           208 |         144 |    0.6127 |     0.6071 |              0.0056 |
| `nft.balance_of (read)`            |       32,517 |            2 |             0 |             0 |           0 |    0.0013 |          0 |              0.0013 |
| `nft.burn (owner of 65)`           |      764,061 |            2 |             9 |           516 |         144 |    0.1447 |     0.1277 |              0.0171 |
| `nft.mint`                         |      199,911 |            2 |             7 |         1,216 |         144 |     2.791 |      2.777 |              0.0143 |
| `nft.owner_of (read)`              |       29,615 |            2 |             0 |             0 |           0 |    0.0013 |          0 |              0.0013 |
| `nft.tokens_of_owner (page of 64)` |    1,460,521 |           66 |             0 |             0 |           0 |    0.0434 |          0 |              0.0434 |
| `nft.transfer`                     |      287,222 |            3 |            11 |         1,096 |         188 |     1.714 |      1.693 |              0.0215 |
| `nft.transfer_from`                |      248,448 |            3 |             9 |           792 |         188 |     1.217 |      1.199 |              0.0179 |

### Collection

| Entry point                                       | Instructions | Read entries | Write entries | Written bytes | Event bytes | Fee (XLM) | Rent (XLM) | Compute + I/O (XLM) |
| ------------------------------------------------- | -----------: | -----------: | ------------: | ------------: | ----------: | --------: | ---------: | ------------------: |
| `collection.add_nft (129th member)`               |      423,307 |            2 |             4 |         2,224 |         116 |    0.5910 |     0.5800 |              0.0110 |
| `collection.add_nft (1st member)`                 |      141,116 |            2 |             4 |           688 |         116 |    0.9968 |     0.9880 |              0.0088 |
| `collection.create_collection (32nd by creator)`  |      198,548 |            2 |             4 |         1,240 |         144 |     1.490 |      1.480 |              0.0095 |
| `collection.get_collections_by_creator (1)`       |       53,129 |            3 |             0 |             0 |           0 |    0.0020 |          0 |              0.0020 |
| `collection.get_nfts_in_collection (page of 100)` |      189,173 |            2 |             0 |             0 |           0 |    0.0016 |          0 |              0.0016 |
| `collection.remove_nft (from 129)`                |      528,683 |            2 |             4 |         2,096 |         120 |    0.1386 |     0.1277 |              0.0109 |

### Royalty

| Entry point                                | Instructions | Read entries | Write entries | Written bytes | Event bytes | Fee (XLM) | Rent (XLM) | Compute + I/O (XLM) |
| ------------------------------------------ | -----------: | -----------: | ------------: | ------------: | ----------: | --------: | ---------: | ------------------: |
| `royalty.configure_royalty (10-way split)` |       76,861 |            3 |             2 |           836 |         120 |     2.822 |      2.816 |              0.0063 |
| `royalty.configure_royalty (creator only)` |       68,324 |            3 |             2 |           356 |         120 |     1.133 |      1.128 |              0.0057 |
| `royalty.freeze_royalty`                   |       73,374 |            2 |             2 |           356 |         108 |    0.1328 |     0.1277 |              0.0051 |
| `royalty.quote_royalty (10-way split)`     |       67,483 |            2 |             0 |             0 |           0 |    0.0014 |          0 |              0.0014 |
| `royalty.quote_royalty (creator only)`     |       33,616 |            2 |             0 |             0 |           0 |    0.0013 |          0 |              0.0013 |
| `royalty.update_royalty`                   |       76,474 |            2 |             2 |           356 |         116 |    0.1328 |     0.1277 |              0.0051 |

### Creator

| Entry point                          | Instructions | Read entries | Write entries | Written bytes | Event bytes | Fee (XLM) | Rent (XLM) | Compute + I/O (XLM) |
| ------------------------------------ | -----------: | -----------: | ------------: | ------------: | ----------: | --------: | ---------: | ------------------: |
| `creator.register`                   |       99,809 |            2 |             3 |           764 |         140 |     1.684 |      1.676 |              0.0072 |
| `creator.set_social_links (8 links)` |      139,960 |            2 |             2 |         1,252 |         144 |     2.738 |      2.732 |              0.0063 |
| `creator.update_profile`             |      101,856 |            2 |             2 |           512 |         144 |    0.1331 |     0.1277 |              0.0054 |
| `creator.verify_creator`             |      163,061 |            2 |             2 |         1,252 |         136 |    0.1341 |     0.1277 |              0.0064 |

### Factory

| Entry point                             | Instructions | Read entries | Write entries | Written bytes | Event bytes | Fee (XLM) | Rent (XLM) | Compute + I/O (XLM) |
| --------------------------------------- | -----------: | -----------: | ------------: | ------------: | ----------: | --------: | ---------: | ------------------: |
| `factory.burn_nft`                      |      817,451 |            5 |            12 |         1,316 |         416 |    0.1530 |     0.1277 |              0.0253 |
| `factory.create_collection_for_creator` |      323,724 |            3 |             6 |         1,548 |         444 |     3.001 |      2.987 |              0.0142 |
| `factory.mint_batch_with_royalty (1)`   |      523,452 |            5 |            11 |         2,128 |         532 |     4.254 |      4.229 |              0.0245 |
| `factory.mint_batch_with_royalty (25)`  |   23,102,805 |            5 |           155 |        30,076 |      13,300 |   102.950 |    102.640 |              0.3093 |
| `factory.mint_with_royalty`             |      489,895 |            5 |            11 |         2,116 |         532 |     5.155 |      5.131 |              0.0244 |
| `factory.set_contracts`                 |      142,202 |            2 |             3 |           800 |         400 |     1.206 |      1.198 |              0.0076 |

### Where the fee comes from

Each contract's measured calls, summed across the entry points in its table above, split by the term that produced the fee. The remaining balance up to 100% is the per-entry read and write charges and the instruction charge.

| Contract   | Instructions | Read entries | Write entries | Read bytes | Write bytes |  Events |    Rent |   Total | Rent share |
| ---------- | -----------: | -----------: | ------------: | ---------: | ----------: | ------: | ------: | ------: | ---------: |
| NFT        |        7,762 |      756,250 |       380,000 |     27,087 |      44,861 |   7,893 |   6.403 |   6.526 |      98.1% |
| Collection |        3,837 |      181,250 |       160,000 |     15,400 |      73,221 |   4,845 |   3.176 |   3.220 |      98.6% |
| Royalty    |          994 |      137,500 |        80,000 |      5,223 |      22,313 |   4,532 |   4.199 |   4.224 |      99.4% |
| Creator    |        1,263 |      106,250 |        90,000 |      5,443 |      44,298 |   5,511 |   4.663 |   4.689 |      99.5% |
| Factory    |       63,502 |    1,393,750 |     1,980,000 |     18,177 |     445,127 | 152,581 | 116.313 | 116.718 |      99.7% |

<!-- END GENERATED: resource costs -->

## Reading the totals

The tables answer "what does this call cost"; they do not answer "what should I
change". Two patterns are worth knowing before drawing conclusions from them:

- **Entry point count beats instruction count.** A call that touches five ledger
  entries pays more in read charges than a call that runs a hundred million
  instructions. When a redesign is on the table, the entry is the unit to
  reduce, not the loop.
- **Per-owner and per-collection vectors grow.** Any entry point whose cost is
  quoted at a size grows with that size, because a growing vector is rewritten
  in full on each change. The budgets in the benchmark suite are set at those
  sizes so the growth cannot become a silent regression.
