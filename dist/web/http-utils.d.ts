import type { IncomingMessage, ServerResponse } from 'node:http';
export declare class HttpError extends Error {
    readonly status: number;
    readonly code: string;
    readonly issues?: readonly string[] | undefined;
    constructor(status: number, code: string, message: string, issues?: readonly string[] | undefined);
}
export declare const MAX_BODY_BYTES: number;
export declare const SECURITY_HEADERS: Readonly<Record<string, string>>;
export declare function sendJson(res: ServerResponse, status: number, body: unknown): void;
export declare function sendError(res: ServerResponse, error: HttpError): void;
export declare function readJsonBody(req: IncomingMessage, limit?: number): Promise<unknown>;
export declare function asObject(value: unknown, what?: string): Record<string, unknown>;
export declare function requireString(obj: Record<string, unknown>, key: string, maxLength?: number): string;
export declare function optionalBool(obj: Record<string, unknown>, key: string, fallback: boolean): boolean;
export declare function stringArray(obj: Record<string, unknown>, key: string, maxItems: number, maxLength?: number): string[];
