import { readFile, stat } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import path from 'node:path';
import { SECURITY_HEADERS } from './http-utils.js';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

/**
 * Resolves a URL path to a file INSIDE `root`, or `null`.
 * Rejects traversal (`..`, encoded or not), NUL bytes, backslashes and dotfiles.
 */
export function resolveStaticPath(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0') || decoded.includes('\\')) return null;
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/u, '');
  const segments = relative.split('/');
  if (segments.some((segment) => segment === '..' || segment === '.' || segment.startsWith('.'))) return null;

  const resolvedRoot = path.resolve(root);
  const full = path.resolve(resolvedRoot, ...segments);
  return full.startsWith(resolvedRoot + path.sep) ? full : null;
}

export async function serveStatic(root: string, urlPath: string, res: ServerResponse): Promise<boolean> {
  const file = resolveStaticPath(root, urlPath);
  if (!file) return false;
  const type = CONTENT_TYPES[path.extname(file).toLowerCase()];
  if (!type) return false;
  try {
    if (!(await stat(file)).isFile()) return false;
    const content = await readFile(file);
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': type, 'Content-Length': content.length });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}
