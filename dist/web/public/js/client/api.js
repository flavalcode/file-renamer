export class ApiError extends Error {
    status;
    code;
    issues;
    constructor(status, code, message, issues = []) {
        super(message);
        this.status = status;
        this.code = code;
        this.issues = issues;
        this.name = 'ApiError';
    }
}
export function createApi(token) {
    async function call(method, url, body) {
        let response;
        try {
            response = await fetch(url, {
                method,
                headers: {
                    'x-renamer-token': token,
                    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
                },
                body: body === undefined ? undefined : JSON.stringify(body),
                cache: 'no-store',
            });
        }
        catch {
            throw new ApiError(0, 'NETWORK', 'Impossibile contattare l\'app. È ancora in esecuzione nel terminale?');
        }
        const text = await response.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        }
        catch {
            data = null;
        }
        if (!response.ok) {
            const error = (data ?? {});
            throw new ApiError(response.status, error.error ?? 'ERROR', error.message ?? `Errore ${response.status}`, error.issues ?? []);
        }
        return data;
    }
    return {
        info: () => call('GET', '/api/info'),
        folders: (path, showHidden) => call('GET', `/api/folders?${new URLSearchParams({ ...(path ? { path } : {}), ...(showHidden ? { hidden: '1' } : {}) }).toString()}`),
        scan: (request) => call('POST', '/api/scan', request),
        plan: (request) => call('POST', '/api/plan', request),
        apply: (request) => call('POST', '/api/apply', request),
        undo: (runId) => call('POST', '/api/undo', { runId }),
    };
}
