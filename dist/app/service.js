import { buildPlan } from '../core/planner.js';
import { presetRequiresExif } from '../core/preset.js';
import { scanDirectory } from '../fs/scanner.js';
export async function planDirectory(root, preset, options = {}) {
    const scan = await scanDirectory(root, {
        filters: preset.filters,
        loadExif: presetRequiresExif(preset),
    });
    const plan = buildPlan(scan.entries, preset, { now: options.now, siblings: scan.siblings });
    return { plan, scan };
}
