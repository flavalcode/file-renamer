export class HttpError extends Error {
    status;
    code;
    issues;
    constructor(status, code, message, issues) {
        super(message);
        this.status = status;
        this.code = code;
        this.issues = issues;
        this.name = 'HttpError';
    }
}
export const MAX_BODY_BYTES = 4 * 1024 * 1024;
export const SECURITY_HEADERS = {
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': 'no-store',
    'Cross-Origin-Resource-Policy': 'same-origin',
};
export function sendJson(res, status, body) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        ...SECURITY_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(payload),
    });
    res.end(payload);
}
export function sendError(res, error) {
    const body = {
        error: error.code,
        message: error.message,
        ...(error.issues ? { issues: error.issues } : {}),
    };
    sendJson(res, error.status, body);
}
export async function readJsonBody(req, limit = MAX_BODY_BYTES) {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
        throw new HttpError(413, 'BODY_TOO_LARGE', 'Richiesta troppo grande.');
    }
    const chunks = [];
    let received = 0;
    for await (const chunk of req) {
        const buffer = chunk;
        received += buffer.length;
        if (received > limit) {
            req.destroy();
            throw new HttpError(413, 'BODY_TOO_LARGE', 'Richiesta troppo grande.');
        }
        chunks.push(buffer);
    }
    if (received === 0) {
        return {};
    }
    try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    catch {
        throw new HttpError(400, 'BAD_JSON', 'Il corpo della richiesta non è JSON valido.');
    }
}
export function asObject(value, what = 'richiesta') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new HttpError(400, 'BAD_REQUEST', `La ${what} deve essere un oggetto JSON.`);
    }
    return value;
}
export function requireString(obj, key, maxLength = 4096) {
    const value = obj[key];
    if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || value.includes('\0')) {
        throw new HttpError(400, 'BAD_REQUEST', `Campo "${key}" mancante o non valido.`);
    }
    return value;
}
export function optionalBool(obj, key, fallback) {
    const value = obj[key];
    if (value === undefined)
        return fallback;
    if (typeof value !== 'boolean') {
        throw new HttpError(400, 'BAD_REQUEST', `Campo "${key}" deve essere true o false.`);
    }
    return value;
}
export function stringArray(obj, key, maxItems, maxLength = 1024) {
    const value = obj[key];
    if (value === undefined)
        return [];
    if (!Array.isArray(value) || value.length > maxItems) {
        throw new HttpError(400, 'BAD_REQUEST', `Campo "${key}" deve essere un elenco (max ${maxItems} elementi).`);
    }
    return value.map((item) => {
        if (typeof item !== 'string' || item.length > maxLength) {
            throw new HttpError(400, 'BAD_REQUEST', `Campo "${key}" contiene un valore non valido.`);
        }
        return item;
    });
}
