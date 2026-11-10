/** Public API of the library (used by the CLI and by the future web UI/back-end). */
export * from './core/types.js';
export * from './core/errors.js';
export { splitFileName, collisionKey, toNfc } from './core/filename.js';
export { naturalCompare } from './core/natural-sort.js';
export { validateFileName } from './core/validation.js';
export { applyRule, applyRules } from './core/rules/index.js';
export { computeDigits, assignSequence } from './core/sequence.js';
export { buildPlan } from './core/planner.js';
export type { PlanOptions } from './core/planner.js';
export {
  DEFAULT_FILTERS,
  DEFAULT_SEQUENCE,
  parsePreset,
  parsePresetJson,
  presetRequiresExif,
} from './core/preset.js';
export * from './fs/scanner.js';
export * from './fs/executor.js';
export * from './fs/journal.js';
export * from './fs/preset-file.js';
export * from './app/service.js';
export { startWebServer } from './web/server.js';
export type { RunningServer, WebServerOptions } from './web/server.js';
export { WebService } from './web/service.js';
