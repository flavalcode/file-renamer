import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

export const TOKEN_HEADER = 'x-renamer-token';

export function generateToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Constant-time comparison (also safe when the lengths differ). */
export function tokensMatch(expected: string, received: string | undefined): boolean {
  if (received === undefined) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length) {
    timingSafeEqual(a, a); // keep timing similar
    return false;
  }
  return timingSafeEqual(a, b);
}

/** The only authorities the server answers to (defends against DNS rebinding). */
export function allowedHosts(port: number): ReadonlySet<string> {
  return new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
}

export function isHostAllowed(headers: IncomingHttpHeaders, port: number): boolean {
  const host = headers.host;
  return typeof host === 'string' && allowedHosts(port).has(host.toLowerCase());
}

/**
 * Cross-origin protection. Browsers always send `Origin` on cross-site POSTs
 * and on `fetch` with custom headers; a missing Origin is accepted only for
 * same-origin GETs and non-browser clients (they still need the token).
 */
export function isOriginAllowed(headers: IncomingHttpHeaders, port: number): boolean {
  const origin = headers.origin;
  if (origin === undefined) return true;
  if (typeof origin !== 'string') return false;
  return [...allowedHosts(port)].some((host) => origin.toLowerCase() === `http://${host}`);
}

export function isJsonContentType(headers: IncomingHttpHeaders): boolean {
  const type = headers['content-type'];
  return typeof type === 'string' && /^application\/json(\s*;|$)/iu.test(type);
}
