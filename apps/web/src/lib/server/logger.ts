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

function serialize(level: LogLevel, message: string, fields?: LogFields): string {
  const entry = {
    level,
    message,
    time: new Date().toISOString(),
    ...fields,
  };
  return process.env.NODE_ENV === 'development'
    ? `${entry.time} [${level.toUpperCase()}] ${message} ${fields ? JSON.stringify(fields) : ''}`
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
