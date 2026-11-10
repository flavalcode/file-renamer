import type { FileEntry, Preset, RenamePlan } from './types.js';
export interface PlanOptions {
    readonly now?: Date;
    readonly siblings?: ReadonlyMap<string, readonly string[]>;
}
export declare function buildPlan(entries: readonly FileEntry[], preset: Preset, options?: PlanOptions): RenamePlan;
