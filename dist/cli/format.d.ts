import type { RenamePlan } from '../core/types.js';
import type { ExecutionResult } from '../fs/executor.js';
export interface Style {
    green(text: string): string;
    red(text: string): string;
    yellow(text: string): string;
    dim(text: string): string;
    bold(text: string): string;
}
export declare function createStyle(enabled: boolean): Style;
export declare function renderPlan(plan: RenamePlan, root: string, style: Style, showAll: boolean): string;
export declare function planToJson(plan: RenamePlan): unknown;
export declare function renderResult(result: ExecutionResult, style: Style): string;
