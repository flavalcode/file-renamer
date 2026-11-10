import type { Filters, Preset, SequenceOptions } from './types.js';
export declare const MAX_PRESET_BYTES: number;
export declare const MAX_RULES = 50;
export declare const DEFAULT_MAX_FILES = 10000;
export declare const DEFAULT_FILTERS: Filters;
export declare const DEFAULT_SEQUENCE: SequenceOptions;
export declare function parsePreset(input: unknown): Preset;
export declare function parsePresetJson(text: string): Preset;
export declare function presetRequiresExif(preset: Preset): boolean;
