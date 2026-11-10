import { createServer } from 'node:http';
import { errorMessage } from '../core/errors.js';
import { HttpError, SECURITY_HEADERS, readJsonBody, sendError, sendJson } from './http-utils.js';
import { TOKEN_HEADER, generateToken, isHostAllowed, isJsonContentType, isOriginAllowed, tokensMatch, } from './security.js';
import { WebService, toHttpError } from './service.js';
import { serveStatic } from './static.js';
export const BIND_ADDRESS = '127.0.0.1';
function splitUrl(raw) {
    const value = raw ?? '/';
    const index = value.indexOf('?');
    return {
        pathname: index === -1 ? value : value.slice(0, index),
        query: new URLSearchParams(index === -1 ? '' : value.slice(index + 1)),
    };
}
export async function startWebServer(options) {
    const token = options.token ?? generateToken();
    const service = new WebService(options);
    let port = 0;
    const route = async (req, res, pathname, query) => {
        if (!tokensMatch(token, req.headers[TOKEN_HEADER])) {
            throw new HttpError(401, 'UNAUTHORIZED', 'Sessione non valida: riapri l\'app dal link mostrato nel terminale.');
        }
        const method = req.method;
        if (method === 'GET') {
            if (pathname === '/api/info')
                return sendJson(res, 200, await service.info());
            if (pathname === '/api/folders') {
                return sendJson(res, 200, await service.folders(query.get('path') ?? undefined, query.get('hidden') === '1'));
            }
        }
        else if (method === 'POST') {
            if (!isJsonContentType(req.headers)) {
                throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type deve essere application/json.');
            }
            const handlers = {
                '/api/scan': (body) => service.scan(body),
                '/api/plan': (body) => service.plan(body),
                '/api/apply': (body) => service.apply(body),
                '/api/undo': (body) => service.undo(body),
            };
            const handler = handlers[pathname];
            if (handler)
                return sendJson(res, 200, await handler(await readJsonBody(req)));
        }
        throw new HttpError(404, 'NOT_FOUND', 'Risorsa non trovata.');
    };
    const handle = async (req, res) => {
        if (!isHostAllowed(req.headers, port) || !isOriginAllowed(req.headers, port)) {
            throw new HttpError(403, 'FORBIDDEN', 'Richiesta non consentita.');
        }
        if (req.method !== 'GET' && req.method !== 'POST') {
            throw new HttpError(405, 'METHOD_NOT_ALLOWED', 'Metodo non consentito.');
        }
        const { pathname, query } = splitUrl(req.url);
        if (!pathname.startsWith('/')) {
            throw new HttpError(400, 'BAD_REQUEST', 'Indirizzo non valido.');
        }
        if (pathname.startsWith('/api/')) {
            return route(req, res, pathname, query);
        }
        if (req.method === 'GET' && (await serveStatic(options.staticDir, pathname, res))) {
            return;
        }
        throw new HttpError(404, 'NOT_FOUND', 'Pagina non trovata.');
    };
    const server = createServer((req, res) => {
        handle(req, res).catch((error) => {
            const httpError = toHttpError(error);
            if (httpError.status >= 500 && (options.debug ?? false)) {
                (options.log ?? ((m) => process.stderr.write(`${m}\n`)))(`Errore: ${errorMessage(error)}`);
            }
            if (res.headersSent) {
                res.destroy();
                return;
            }
            for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
                res.setHeader(name, value);
            }
            sendError(res, httpError);
        });
    });
    server.headersTimeout = 10_000;
    server.requestTimeout = 60_000;
    server.keepAliveTimeout = 5_000;
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(options.port ?? 0, BIND_ADDRESS, () => {
            server.off('error', reject);
            resolve();
        });
    });
    port = server.address().port;
    const origin = `http://${BIND_ADDRESS}:${port}`;
    return {
        port,
        token,
        origin,
        url: `${origin}/#t=${token}`,
        close: () => new Promise((resolve) => {
            server.close(() => resolve());
            server.closeAllConnections();
        }),
    };
}
