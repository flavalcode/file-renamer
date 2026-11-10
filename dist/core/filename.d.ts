export interface SplitName {
    readonly name: string;
    readonly ext: string;
}
export declare function splitFileName(base: string): SplitName;
export declare function toNfc(text: string): string;
export declare function collisionKey(base: string): string;
export declare function codePointLength(text: string): number;
