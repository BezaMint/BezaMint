export function throttle<T extends (...args: any[]) => any>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let last = 0;
  return (...args: Parameters<T>) => { const now = Date.now(); if (now - last >= ms) { last = now; fn(...args); } };
}
