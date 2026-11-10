export declare const EXIF_EXTENSIONS: readonly string[];
export declare function parseExifDateString(text: string): number | null;
export declare function parseExifDate(buf: Buffer): number | null;
export declare function readExifDate(filePath: string): Promise<number | null>;
