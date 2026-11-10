import type { ServerResponse } from 'node:http';
export declare function resolveStaticPath(root: string, urlPath: string): string | null;
export declare function serveStatic(root: string, urlPath: string, res: ServerResponse): Promise<boolean>;
