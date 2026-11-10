import type { Issue } from './types.js';
export declare const MAX_NAME_BYTES = 255;
export declare const MAX_NAME_UTF16_UNITS = 255;
export declare const WINDOWS_MAX_PATH = 259;
export declare function findForbiddenChars(text: string): string[];
export declare function hasForbiddenChars(text: string): boolean;
export declare function validateFileName(stem: string, ext: string, dirPath?: string): Issue[];
