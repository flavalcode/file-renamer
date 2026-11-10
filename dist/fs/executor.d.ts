import type { RenamePlan } from '../core/types.js';
import type { FsPort } from './fs-port.js';
import { JournalStore } from './journal.js';
export type ExecutionStatus = 'applied' | 'rolled_back' | 'rollback_failed' | 'nothing_to_do';
export interface ExecutionResult {
    readonly status: ExecutionStatus;
    readonly runId: string | null;
    readonly renamed: number;
    readonly failure?: string;
    readonly rollbackErrors: readonly string[];
    readonly warnings: readonly string[];
}
export interface ExecuteOptions {
    readonly fs?: FsPort;
    readonly journal?: JournalStore;
    readonly onProgress?: (done: number, total: number) => void;
}
export declare function executePlan(plan: RenamePlan, options?: ExecuteOptions): Promise<ExecutionResult>;
export interface UndoResult extends ExecutionResult {
    readonly undoneRunId: string | null;
}
export declare function undoLast(store: JournalStore, options?: Omit<ExecuteOptions, 'journal'>): Promise<UndoResult>;
