/**
 * Horizon failure classification, shared by the wallet-facing routes.
 *
 * Both routes used to treat *any* Horizon failure as "this account does not
 * exist": the balance endpoint answered `0 XLM, unfunded` and the history
 * endpoint answered `[]`. A Horizon outage was therefore reported to the user as
 * an empty wallet, which is the one answer that makes someone believe their
 * funds are gone. Only a 404 means the account is missing; everything else is a
 * failure the caller is told about.
 *
 * The SDK reports a missing account as a `NotFoundError` carrying the HTTP
 * response, so the status is the reliable signal. It is read structurally rather
 * than with `instanceof`, because a second copy of a dependency in the pnpm
 * store does not share prototypes with this realm — the same trap that once made
 * the indexer log an RPC rejection as `"[object Object]"`.
 */
export function isAccountMissing(err: unknown): boolean {
  const response = (err as { response?: { status?: number } } | null)?.response;
  return response?.status === 404;
}
