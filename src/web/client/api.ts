import type {
  ApiErrorBody,
  ApplyRequest,
  ApplyResponse,
  FolderListing,
  InfoResponse,
  PlanRequest,
  PlanResponse,
  ScanRequest,
  ScanResponse,
  UndoResponse,
} from '../shared/api-types.js';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly issues: readonly string[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface Api {
  info(): Promise<InfoResponse>;
  folders(path: string | null, showHidden: boolean): Promise<FolderListing>;
  scan(request: ScanRequest): Promise<ScanResponse>;
  plan(request: PlanRequest): Promise<PlanResponse>;
  apply(request: ApplyRequest): Promise<ApplyResponse>;
  undo(runId: string): Promise<UndoResponse>;
}

export function createApi(token: string): Api {
  async function call<T>(method: 'GET' | 'POST', url: string, body?: unknown): Promise<T> {
    let response: Response;
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
    } catch {
      throw new ApiError(0, 'NETWORK', 'Impossibile contattare l\'app. È ancora in esecuzione nel terminale?');
    }
    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? (JSON.parse(text) as unknown) : null;
    } catch {
      data = null;
    }
    if (!response.ok) {
      const error = (data ?? {}) as Partial<ApiErrorBody>;
      throw new ApiError(response.status, error.error ?? 'ERROR', error.message ?? `Errore ${response.status}`, error.issues ?? []);
    }
    return data as T;
  }

  return {
    info: () => call('GET', '/api/info'),
    folders: (path, showHidden) =>
      call('GET', `/api/folders?${new URLSearchParams({ ...(path ? { path } : {}), ...(showHidden ? { hidden: '1' } : {}) }).toString()}`),
    scan: (request) => call('POST', '/api/scan', request),
    plan: (request) => call('POST', '/api/plan', request),
    apply: (request) => call('POST', '/api/apply', request),
    undo: (runId) => call('POST', '/api/undo', { runId }),
  };
}
