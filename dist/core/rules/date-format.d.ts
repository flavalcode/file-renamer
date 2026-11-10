export declare const DEFAULT_DATE_FORMAT = "YYYY-MM-DD";
export declare const MAX_DATE_FORMAT_LENGTH = 40;
export declare function assertValidDateFormat(format: string): void;
export declare function formatDate(epochMs: number, format?: string): string;
