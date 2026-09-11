import { NextResponse } from 'next/server';

/**
 * Liveness probe.
 *
 * Deliberately separate from `/api/health`: that endpoint reports whether the
 * deployment can *do its job* (Soroban RPC reachable, IPFS reachable,
 * contracts configured) and answers 503 when it cannot. That is the right
 * answer for a readiness check, but the wrong one for a liveness check —
 * an orchestrator that restarts a container whenever the RPC is slow or
 * briefly unreachable would turn a dependency blip into a crash loop.
 *
 * This route answers a single question: is the HTTP server up and serving
 * requests? It touches no dependency and never fails while the process lives.
 */
export function GET() {
  return NextResponse.json({ status: 'ok' });
}

export const dynamic = 'force-dynamic';
