/**
 * In-memory login throttle: N failed attempts per username+IP inside a window
 * lock the pair until the window expires. This is deliberately process-local —
 * a multi-instance deployment should move the same counters to Redis (the
 * interface below stays the same).
 */
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;

interface AttemptEntry {
  failures: number;
  firstFailureAt: number;
  lockedUntil: number;
}

const attempts = new Map<string, AttemptEntry>();

export function loginThrottleKey(identifier: string, ip: string): string {
  return `${identifier.trim().toLowerCase()}|${ip}`;
}

/** Returns seconds until the key unlocks, or null when it is usable. */
export function lockedSeconds(key: string): number | null {
  const entry = attempts.get(key);
  if (!entry) return null;
  const now = Date.now();
  if (entry.lockedUntil > now) {
    return Math.ceil((entry.lockedUntil - now) / 1000);
  }
  if (now - entry.firstFailureAt > LOGIN_WINDOW_MS) {
    attempts.delete(key);
    return null;
  }
  return null;
}

export function recordLoginFailure(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.firstFailureAt > LOGIN_WINDOW_MS) {
    attempts.set(key, { failures: 1, firstFailureAt: now, lockedUntil: 0 });
    return;
  }
  entry.failures += 1;
  if (entry.failures >= LOGIN_MAX_FAILURES) {
    entry.lockedUntil = now + LOGIN_LOCK_MS;
  }
}

export function clearLoginFailures(key: string): void {
  attempts.delete(key);
}

/** Test helper: forget every counter. */
export function resetLoginThrottle(): void {
  attempts.clear();
}
