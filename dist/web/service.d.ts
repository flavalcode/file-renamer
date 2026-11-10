import type { RenamePlan } from '../core/types.js';
import { HttpError } from './http-utils.js';
import type { ApplyResponse, FolderListing, InfoResponse, PlanResponse, ScanResponse, UndoInfo, UndoResponse } from './shared/api-types.js';
export interface WebServiceOptions {
    readonly stateDir: string;
    readonly home?: string;
    readonly platform?: NodeJS.Platform;
    readonly maxCachedScans?: number;
}
export declare class WebService {
    private readonly scans;
    private readonly journal;
    private readonly home;
    private readonly platform;
    private readonly maxScans;
    private busy;
    constructor(options: WebServiceOptions);
    info(): Promise<InfoResponse>;
    private shortcuts;
    folders(rawPath: string | undefined, showHidden: boolean): Promise<FolderListing>;
    scan(body: unknown): Promise<ScanResponse>;
    private remember;
    private cachedScan;
    plan(body: unknown): Promise<PlanResponse>;
    apply(body: unknown): Promise<ApplyResponse>;
    undoInfo(): Promise<UndoInfo | null>;
    undo(body: unknown): Promise<UndoResponse>;
    private exclusive;
}
export declare function computePlanId(plan: RenamePlan): string;
export declare function toHttpError(error: unknown): HttpError;
