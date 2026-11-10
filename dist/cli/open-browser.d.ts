export interface BrowserCommand {
    readonly command: string;
    readonly args: readonly string[];
}
export declare function browserCommand(url: string, platform: NodeJS.Platform): BrowserCommand | null;
