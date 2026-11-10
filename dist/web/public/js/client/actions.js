import { ApiError } from './api.js';
import { parseExtensions } from './state.js';
export function messageOf(error) {
    if (error instanceof ApiError)
        return error.message;
    return error instanceof Error ? error.message : 'Errore imprevisto.';
}
export async function loadScan(ctx, keepSelection = false) {
    const { state, api } = ctx;
    const scan = await api.scan({
        path: state.path.trim(),
        recursive: state.options.recursive,
        includeHidden: state.options.includeHidden,
        extensions: parseExtensions(state.options.extensions),
    });
    const known = new Set(scan.files.map((file) => file.id));
    state.excluded = keepSelection ? new Set([...state.excluded].filter((id) => known.has(id))) : new Set();
    state.scan = scan;
    state.path = scan.root;
    state.plan = null;
    state.outcome = null;
}
export function selectedCount(ctx) {
    const { scan, excluded } = ctx.state;
    return scan ? scan.files.length - excluded.size : 0;
}
