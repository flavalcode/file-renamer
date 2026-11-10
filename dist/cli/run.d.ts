export declare const EXIT: {
    readonly ok: 0;
    readonly error: 1;
    readonly usage: 2;
    readonly blocked: 3;
};
export interface CliIo {
    stdout(text: string): void;
    stderr(text: string): void;
    readonly isTTY: boolean;
    readonly env: NodeJS.ProcessEnv;
    readonly cwd: string;
    confirm(question: string): Promise<boolean>;
    openUrl?(url: string): void;
    waitForShutdown?(): Promise<void>;
    readonly webAssetsDir?: string;
}
export declare function runCli(argv: readonly string[], io: CliIo): Promise<number>;
