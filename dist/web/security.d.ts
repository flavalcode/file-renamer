import type { IncomingHttpHeaders } from 'node:http';
export declare const TOKEN_HEADER = "x-renamer-token";
export declare function generateToken(): string;
export declare function tokensMatch(expected: string, received: string | undefined): boolean;
export declare function allowedHosts(port: number): ReadonlySet<string>;
export declare function isHostAllowed(headers: IncomingHttpHeaders, port: number): boolean;
export declare function isOriginAllowed(headers: IncomingHttpHeaders, port: number): boolean;
export declare function isJsonContentType(headers: IncomingHttpHeaders): boolean;
