/**
 * GET /api/config
 *
 * Sanitized runtime configuration snapshot for debugging. Secrets are
 * reduced to presence flags, so this is safe to expose; the full dump is
 * gated to non-production environments, where it returns a minimal
 * shell outside development.
 */
import { NextResponse } from 'next/server';
import { collectStartupConfig } from '@/lib/startup';
import { newRequestId, timeRequest, logger } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  const requestId = newRequestId();
  const timer = timeRequest(requestId, 'GET', '/api/config');
  const config = collectStartupConfig();

  // In production, hide even the sanitized dump: only presence flags that
  // the health endpoint already reports are worth returning.
  const body =
    process.env.NODE_ENV === 'production'
      ? {
          environment: config.environment,
          network: config.network,
          contractsConfigured: Object.values(config.contracts).every(Boolean),
        }
      : config;

  timer.done(200, {});
  return NextResponse.json({ data: body });
}
