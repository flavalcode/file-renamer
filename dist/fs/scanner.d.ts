import type { FileEntry, Filters } from '../core/types.js';
export declare const MAX_SCAN_DEPTH = 32;
export interface ScanOptions {
    readonly filters: Filters;
    readonly loadExif?: boolean;
}
export interface ScanResult {
    readonly root: string;
    readonly entries: FileEntry[];
    readonly siblings: Map<string, string[]>;
    readonly skipped: {
        readonly hidden: number;
        readonly symlinks: number;
        readonly filtered: number;
    };
}
export declare function isHiddenName(name: string): boolean;
export declare function globToRegExp(glob: string): RegExp;
export declare function scanDirectory(rootInput: string, options: ScanOptions): Promise<ScanResult>;
