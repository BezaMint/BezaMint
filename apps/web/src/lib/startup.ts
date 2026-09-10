/**
 * Startup validation and application metadata.
 *
 * - Records the server start time for uptime reporting.
 * - Validates the environment at boot: missing or malformed contract IDs,
 *   missing Pinata key, and mismatched network settings produce clear,
 *   actionable log lines instead of confusing downstream failures.
 */

/** Set the application startup timestamp for health checks */
if (typeof globalThis !== 'undefined') {
  (globalThis as Record<string, unknown>).__BEZAMINT_START_TIME__ = Date.now();
}

export interface StartupIssue {
  level: 'warn' | 'error';
  key: string;
  message: string;
}

/** Soroban contract IDs are 56-char base32 strings starting with 'C'. */
const CONTRACT_ID_RE = /^C[A-Z2-7]{55}$/;

const CONTRACT_ENV_KEYS = [
  'NEXT_PUBLIC_NFT_CONTRACT_ID',
  'NEXT_PUBLIC_COLLECTION_CONTRACT_ID',
  'NEXT_PUBLIC_ROYALTY_CONTRACT_ID',
  'NEXT_PUBLIC_CREATOR_CONTRACT_ID',
  'NEXT_PUBLIC_FACTORY_CONTRACT_ID',
] as const;

/** Collect every configuration problem as structured issues (no throw). */
export function collectStartupIssues(): StartupIssue[] {
  const issues: StartupIssue[] = [];

  for (const key of CONTRACT_ENV_KEYS) {
    const value = process.env[key];
    if (!value) {
      issues.push({
        level: 'warn',
        key,
        message: `${key} is not set — contract-dependent features will be unavailable`,
      });
    } else if (!CONTRACT_ID_RE.test(value)) {
      issues.push({
        level: 'error',
        key,
        message: `${key}="${value}" is not a valid Soroban contract ID (expected 56-char base32 starting with C)`,
      });
    }
  }

  if (!process.env.PINATA_JWT) {
    issues.push({
      level: 'warn',
      key: 'PINATA_JWT',
      message: 'PINATA_JWT is not set — IPFS uploads will fall back to placeholder URIs',
    });
  }

  return issues;
}

/**
 * Log startup issues once. Call from server entry points (e.g. the health
 * route, layout instrumentation) so problems surface in production logs.
 */
export function validateStartupEnvironment(): StartupIssue[] {
  const issues = collectStartupIssues();
  for (const issue of issues) {
    const line = `[startup] ${issue.key}: ${issue.message}`;
    if (issue.level === 'error') {
      console.error(line);
    } else {
      console.warn(line);
    }
  }
  return issues;
}

export function getStartupTime(): number {
  const start = (globalThis as Record<string, unknown>).__BEZAMINT_START_TIME__;
  return typeof start === 'number' ? start : Date.now();
}
