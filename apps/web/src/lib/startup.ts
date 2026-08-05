/** Set the application startup timestamp for health checks */
if (typeof globalThis !== 'undefined') {
  (globalThis as Record<string, unknown>).__BEZAMINT_START_TIME__ = Date.now();
}
