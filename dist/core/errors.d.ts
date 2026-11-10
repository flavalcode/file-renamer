export declare class RenamerError extends Error {
    readonly code: string;
    constructor(code: string, message: string, options?: ErrorOptions);
}
export declare class RuleError extends RenamerError {
    constructor(message: string);
}
export declare class PresetError extends RenamerError {
    readonly issues: readonly string[];
    constructor(issues: readonly string[]);
}
export declare function errorMessage(error: unknown): string;
export declare function assertNever(value: never): never;
