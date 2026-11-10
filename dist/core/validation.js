const FORBIDDEN_CHARS = /[<>:"/\\|?*\u0000-\u001F\u007F]/u;
const FORBIDDEN_CHARS_GLOBAL = /[<>:"/\\|?*\u0000-\u001F\u007F]/gu;
const BIDI_CONTROLS = /[\u202A-\u202E\u2066-\u2069]/u;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9\u00B9\u00B2\u00B3]|lpt[0-9\u00B9\u00B2\u00B3])$/iu;
export const MAX_NAME_BYTES = 255;
export const MAX_NAME_UTF16_UNITS = 255;
export const WINDOWS_MAX_PATH = 259;
export function findForbiddenChars(text) {
    const found = new Set();
    for (const match of text.matchAll(FORBIDDEN_CHARS_GLOBAL)) {
        found.add(match[0]);
    }
    return [...found];
}
export function hasForbiddenChars(text) {
    return FORBIDDEN_CHARS.test(text);
}
function printable(char) {
    const code = char.codePointAt(0) ?? 0;
    return code < 0x20 || code === 0x7f ? `U+${code.toString(16).toUpperCase().padStart(4, '0')}` : char;
}
export function validateFileName(stem, ext, dirPath) {
    const issues = [];
    const base = stem + ext;
    const error = (code, message) => {
        issues.push({ code, severity: 'error', message });
    };
    if (stem.length === 0 || base === '.' || base === '..') {
        error('EMPTY_NAME', 'Il nuovo nome è vuoto.');
        return issues;
    }
    const forbidden = findForbiddenChars(base);
    if (forbidden.length > 0) {
        error('INVALID_CHARS', `Caratteri non ammessi nel nome: ${forbidden.map(printable).join(' ')}`);
    }
    if (BIDI_CONTROLS.test(base)) {
        error('SUSPICIOUS_UNICODE', 'Il nome contiene caratteri di controllo della direzione del testo.');
    }
    const firstSegment = (base.split('.')[0] ?? '').replace(/[ ]+$/u, '');
    if (WINDOWS_RESERVED.test(firstSegment)) {
        error('RESERVED_NAME', `"${firstSegment}" è un nome riservato di Windows.`);
    }
    if (/[. ]$/u.test(base)) {
        error('TRAILING_DOT_OR_SPACE', 'Il nome non può terminare con un punto o uno spazio.');
    }
    if (Buffer.byteLength(base, 'utf8') > MAX_NAME_BYTES || base.length > MAX_NAME_UTF16_UNITS) {
        error('NAME_TOO_LONG', `Il nome supera il limite di ${MAX_NAME_BYTES} caratteri/byte.`);
    }
    if (dirPath !== undefined && dirPath.length + 1 + base.length > WINDOWS_MAX_PATH) {
        issues.push({
            code: 'PATH_TOO_LONG',
            severity: 'warning',
            message: 'Il percorso completo supera 259 caratteri: potrebbe non funzionare su Windows.',
        });
    }
    return issues;
}
