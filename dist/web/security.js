import { randomBytes, timingSafeEqual } from 'node:crypto';
export const TOKEN_HEADER = 'x-renamer-token';
export function generateToken() {
    return randomBytes(24).toString('base64url');
}
export function tokensMatch(expected, received) {
    if (received === undefined)
        return false;
    const a = Buffer.from(expected);
    const b = Buffer.from(received);
    if (a.length !== b.length) {
        timingSafeEqual(a, a);
        return false;
    }
    return timingSafeEqual(a, b);
}
export function allowedHosts(port) {
    return new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
}
export function isHostAllowed(headers, port) {
    const host = headers.host;
    return typeof host === 'string' && allowedHosts(port).has(host.toLowerCase());
}
export function isOriginAllowed(headers, port) {
    const origin = headers.origin;
    if (origin === undefined)
        return true;
    if (typeof origin !== 'string')
        return false;
    return [...allowedHosts(port)].some((host) => origin.toLowerCase() === `http://${host}`);
}
export function isJsonContentType(headers) {
    const type = headers['content-type'];
    return typeof type === 'string' && /^application\/json(\s*;|$)/iu.test(type);
}
