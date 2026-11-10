export interface FsPort {
    rename(from: string, to: string): Promise<void>;
    kind(path: string): Promise<'file' | 'other' | 'missing'>;
}
export declare const nodeFsPort: FsPort;
