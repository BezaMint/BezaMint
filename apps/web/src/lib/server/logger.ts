/**
 * Structured logger for server-side code.
 *
 * Emits a single JSON line per log entry with a stable request ID, so API
 * handlers can be traced end-to-end and durations are comparable across
 * requests. In production, output is JSON; in development it is pretty-printed
 * for readability.
 */

export interface LogFields {
  [key: string]: unknown;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Keys whose values must never appear in logs. Also covers substrings:
 * a field named `authToken` or `x-api-key` is redacted too.
 */
const SECRET_KEY_PATTERN =
  /(jwt|token|secret|password|passwd|api[_-]?key|authorization|auth|credential|cookie|private[_-]?key|session)/i;

const REDACTED = '[REDACTED]';

function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key);
}

function redactValue(key: string, value: unknown): unknown {
  if (isSecretKey(key)) return REDACTED;
  if (typeof value === 'object' && value !== null) {
    if (Array.isArray(value)) {
      return value.map((item, index) => redactValue(`${key}[${index}]`, item));
    }
    const out: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      out[childKey] = redactValue(childKey, childValue);
    }
    return out;
  }
  return value;
}

/** Sanitize a fields object so secrets never reach the log line. */
export function redactFields(fields?: LogFields): LogFields | undefined {
  if (!fields) return fields;
  const out: LogFields = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = redactValue(key, value);
  }
  return out;
}

function serialize(level: LogLevel, message: string, fields?: LogFields): string {
  const entry = {
    level,
    message,
    time: new Date().toISOString(),
    ...redactFields(fields),
  };
  return process.env.NODE_ENV === 'development'
    ? `${entry.time} [${level.toUpperCase()}] ${message} ${fields ? JSON.stringify(redactFields(fields)) : ''}`
    : JSON.stringify(entry);
}

export const logger = {
  debug(message: string, fields?: LogFields) {
    if (process.env.NODE_ENV === 'production') return;
    console.debug(serialize('debug', message, fields));
  },
  info(message: string, fields?: LogFields) {
    console.info(serialize('info', message, fields));
  },
  warn(message: string, fields?: LogFields) {
    console.warn(serialize('warn', message, fields));
  },
  error(message: string, fields?: LogFields) {
    console.error(serialize('error', message, fields));
  },
};

/** Generate a short unique request ID (crypto-safe where available). */
export function newRequestId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Timing helper for request handlers: call with a request ID, run the work,
 * then call `done()` to log the duration and return any error info.
 */
export function timeRequest(requestId: string, method: string, path: string) {
  const started = Date.now();
  return {
    requestId,
    done(status: number, fields?: LogFields) {
      logger.info('request complete', {
        requestId,
        method,
        path,
        status,
        durationMs: Date.now() - started,
        ...fields,
      });
    },
  };
}
