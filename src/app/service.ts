import { buildPlan } from '../core/planner.js';
import type { PlanOptions } from '../core/planner.js';
import { presetRequiresExif } from '../core/preset.js';
import type { Preset, RenamePlan } from '../core/types.js';
import { scanDirectory } from '../fs/scanner.js';
import type { ScanResult } from '../fs/scanner.js';

export interface DirectoryPlan {
  readonly plan: RenamePlan;
  readonly scan: ScanResult;
}

/**
 * Scans a folder and builds the plan. This is the single entry point shared
 * by the CLI and the (future) web back-end, so both behave identically.
 */
export async function planDirectory(
  root: string,
  preset: Preset,
  options: Pick<PlanOptions, 'now'> = {},
): Promise<DirectoryPlan> {
  const scan = await scanDirectory(root, {
    filters: preset.filters,
    loadExif: presetRequiresExif(preset),
  });
  const plan = buildPlan(scan.entries, preset, { now: options.now, siblings: scan.siblings });
  return { plan, scan };
}
