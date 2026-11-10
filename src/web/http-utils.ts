import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiErrorBody } from './shared/api-types.js';

/** An error that maps directly to an HTTP response. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly issues?: readonly string[],
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Headers added to EVERY response (API and static files). */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

export function sendError(res: ServerResponse, error: HttpError): void {
  const body: ApiErrorBody = {
    error: error.code,
    message: error.message,
    ...(error.issues ? { issues: error.issues } : {}),
  };
  sendJson(res, error.status, body);
}

/** Reads a JSON body with a hard size limit (the stream is cut as soon as it is exceeded). */
export async function readJsonBody(req: IncomingMessage, limit: number = MAX_BODY_BYTES): Promise<unknown> {
  const declared = Number(req.headers['content-length']);
  if (Number.isFinite(declared) && declared > limit) {
    throw new HttpError(413, 'BODY_TOO_LARGE', 'Richiesta troppo grande.');
  }
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of req) {
    const buffer = chunk as Buffer;
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
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new HttpError(400, 'BAD_JSON', 'Il corpo della richiesta non è JSON valido.');
  }
}

export function asObject(value: unknown, what = 'richiesta'): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError(400, 'BAD_REQUEST', `La ${what} deve essere un oggetto JSON.`);
  }
  return value as Record<string, unknown>;
}

export function requireString(obj: Record<string, unknown>, key: string, maxLength = 4096): string {
  const value = obj[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || value.includes('\0')) {
    throw new HttpError(400, 'BAD_REQUEST', `Campo "${key}" mancante o non valido.`);
  }
  return value;
}

export function optionalBool(obj: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = obj[key];
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    throw new HttpError(400, 'BAD_REQUEST', `Campo "${key}" deve essere true o false.`);
  }
  return value;
}

export function stringArray(obj: Record<string, unknown>, key: string, maxItems: number, maxLength = 1024): string[] {
  const value = obj[key];
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new HttpError(400, 'BAD_REQUEST', `Campo "${key}" deve essere un elenco (max ${maxItems} elementi).`);
  }
  return value.map((item: unknown) => {
    if (typeof item !== 'string' || item.length > maxLength) {
      throw new HttpError(400, 'BAD_REQUEST', `Campo "${key}" contiene un valore non valido.`);
    }
    return item;
  });
}
