export type JournalStatus = 'pending' | 'applied' | 'rolled_back' | 'rollback_failed' | 'undone';
export interface JournalOperation {
    readonly from: string;
    readonly to: string;
}
export interface Journal {
    readonly version: 1;
    readonly runId: string;
    readonly createdAt: string;
    readonly status: JournalStatus;
    readonly operations: readonly JournalOperation[];
}
export interface JournalRecord {
    readonly file: string;
    readonly journal: Journal;
}
export declare const DEFAULT_RETENTION = 20;
export declare function defaultStateDir(env?: NodeJS.ProcessEnv, platform?: NodeJS.Platform, home?: string): string;
export declare function parseJournal(value: unknown): Journal;
export declare class JournalStore {
    readonly dir: string;
    private readonly retention;
    constructor(dir: string, retention?: number);
    static createRunId(): string;
    create(runId: string, operations: readonly JournalOperation[]): Promise<Journal>;
    setStatus(runId: string, status: JournalStatus): Promise<void>;
    list(): Promise<JournalRecord[]>;
    latestApplied(): Promise<JournalRecord | null>;
    private fileFor;
    private write;
    private prune;
}
