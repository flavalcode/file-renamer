import { ApiError } from './api.js';
import { parseExtensions } from './state.js';
import type { Context } from './state.js';

/** Human-readable text for any error thrown by the API layer. */
export function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : 'Errore imprevisto.';
}

/**
 * Scans the chosen folder with the current options and stores the result.
 * With `keepSelection` the files the user had deselected stay deselected.
 */
export async function loadScan(ctx: Context, keepSelection = false): Promise<void> {
  const { state, api } = ctx;
  const scan = await api.scan({
    path: state.path.trim(),
    recursive: state.options.recursive,
    includeHidden: state.options.includeHidden,
    extensions: parseExtensions(state.options.extensions),
  });
  const known = new Set(scan.files.map((file) => file.id));
  state.excluded = keepSelection ? new Set([...state.excluded].filter((id) => known.has(id))) : new Set<string>();
  state.scan = scan;
  state.path = scan.root;
  state.plan = null;
  state.outcome = null;
}

export function selectedCount(ctx: Context): number {
  const { scan, excluded } = ctx.state;
  return scan ? scan.files.length - excluded.size : 0;
}
