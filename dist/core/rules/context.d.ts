import type { FileEntry, Issue } from '../types.js';
export interface RuleContext {
    readonly entry: FileEntry;
    readonly parentName: string;
    readonly now: Date;
    warn(issue: Omit<Issue, 'severity'>): void;
}
