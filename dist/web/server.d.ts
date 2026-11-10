import type { WebServiceOptions } from './service.js';
export interface WebServerOptions extends WebServiceOptions {
    readonly staticDir: string;
    readonly port?: number;
    readonly token?: string;
    readonly debug?: boolean;
    readonly log?: (message: string) => void;
}
export interface RunningServer {
    readonly port: number;
    readonly token: string;
    readonly origin: string;
    readonly url: string;
    close(): Promise<void>;
}
export declare const BIND_ADDRESS = "127.0.0.1";
export declare function startWebServer(options: WebServerOptions): Promise<RunningServer>;
