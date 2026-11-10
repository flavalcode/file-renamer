export declare class UsageError extends Error {
}
export interface FilterOverrides {
    recursive?: boolean;
    includeHidden?: boolean;
    extensions?: string[];
    include?: string[];
    exclude?: string[];
    nameRegex?: string;
    maxFiles?: number;
}
export interface CommonFlags {
    readonly json: boolean;
    readonly noColor: boolean;
    readonly yes: boolean;
    readonly stateDir: string | undefined;
}
export type ParsedCommand = {
    readonly command: 'help';
} | {
    readonly command: 'version';
} | ({
    readonly command: 'history';
} & CommonFlags) | ({
    readonly command: 'undo';
} & CommonFlags) | ({
    readonly command: 'ui';
    readonly port: number;
    readonly noOpen: boolean;
} & CommonFlags) | ({
    readonly command: 'validate';
    readonly file: string;
} & CommonFlags) | ({
    readonly command: 'rename';
    readonly dir: string;
    readonly source: {
        readonly presetFile: string;
    } | {
        readonly raw: Record<string, unknown>;
    };
    readonly filters: FilterOverrides;
    readonly apply: boolean;
    readonly showAll: boolean;
} & CommonFlags);
export declare function parseCommandLine(argv: readonly string[]): ParsedCommand;
