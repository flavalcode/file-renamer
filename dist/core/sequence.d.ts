import type { FileEntry, OrderBy, SequenceOptions } from './types.js';
export declare const MAX_SEQUENCE_START = 1000000000;
export declare const MAX_SEQUENCE_STEP = 1000000;
export declare const MAX_FIXED_DIGITS = 12;
export interface SequencedEntry {
    readonly entry: FileEntry;
    readonly sequence: string;
}
export declare function assertValidSequenceOptions(options: SequenceOptions): void;
export declare function computeDigits(count: number, options: Pick<SequenceOptions, 'start' | 'step' | 'digits'>): number;
export declare function formatSequenceNumber(value: number, digits: number): string;
export declare function orderEntries(entries: readonly FileEntry[], orderBy: OrderBy, reverse: boolean): FileEntry[];
export declare function assignSequence(entries: readonly FileEntry[], options: SequenceOptions): SequencedEntry[];
