import type { PlanOptions } from '../core/planner.js';
import type { Preset, RenamePlan } from '../core/types.js';
import type { ScanResult } from '../fs/scanner.js';
export interface DirectoryPlan {
    readonly plan: RenamePlan;
    readonly scan: ScanResult;
}
export declare function planDirectory(root: string, preset: Preset, options?: Pick<PlanOptions, 'now'>): Promise<DirectoryPlan>;
