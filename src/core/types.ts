/**
 * Shared domain types. This file contains only type declarations (no logic),
 * so it can be imported from anywhere without side effects.
 */

/** A file selected for renaming, with the metadata needed by rules and sorting. */
export interface FileEntry {
  /** Absolute directory that contains the file. */
  readonly dir: string;
  /** Full file name, extension included (e.g. `IMG_001.JPG`). */
  readonly base: string;
  /** File name without the extension (e.g. `IMG_001`). */
  readonly name: string;
  /** Extension including the leading dot, original casing (e.g. `.JPG`), or `''`. */
  readonly ext: string;
  readonly size: number;
  readonly mtimeMs: number;
  readonly birthtimeMs: number;
  /** EXIF capture date (local time, epoch ms) when available. */
  readonly exifDateMs?: number | null;
}

// ---------------------------------------------------------------------------
// Rules (the "pipeline" mode). Each rule transforms the file name WITHOUT extension.
// ---------------------------------------------------------------------------

export type DateSource = 'modified' | 'created' | 'exif' | 'today';

export interface ReplaceRule {
  readonly type: 'replace';
  readonly find: string;
  readonly with: string;
  /** Interpret `find` as a regular expression (default: false, literal text). */
  readonly regex?: boolean;
  /** Default: true. */
  readonly caseSensitive?: boolean;
  /** Replace every occurrence (default: true) or only the first one. */
  readonly all?: boolean;
}

export interface AffixRule {
  readonly type: 'affix';
  readonly prefix?: string;
  readonly suffix?: string;
}

export interface CaseRule {
  readonly type: 'case';
  readonly mode: 'lower' | 'upper' | 'title' | 'sentence';
}

export interface SeparatorsRule {
  readonly type: 'separators';
  /** What to do with whitespace (default: `keep`). */
  readonly spaces?: 'keep' | 'underscore' | 'dash' | 'dot' | 'remove';
  /** Collapse repeated separators (`  `, `__`, `--`, `..`) into one. */
  readonly collapse?: boolean;
  /** Trim whitespace and `_ - .` at both ends. */
  readonly trim?: boolean;
}

export interface RemoveCharsRule {
  readonly type: 'removeChars';
  readonly digits?: boolean;
  /** Punctuation and symbols (includes `_` and `-`). */
  readonly punctuation?: boolean;
  readonly emoji?: boolean;
  /** Remove `(...)`, `[...]` and `{...}` segments, with the whitespace before them. */
  readonly brackets?: boolean;
  /** Every character listed here is removed. */
  readonly custom?: string;
}

export interface AccentsRule {
  readonly type: 'accents';
}

export interface CutRule {
  readonly type: 'cut';
  readonly fromStart?: number;
  readonly fromEnd?: number;
}

export interface InsertRule {
  readonly type: 'insert';
  readonly text: string;
  readonly position: 'start' | 'end' | 'index' | 'before' | 'after';
  /** Required for `position: 'index'` (0-based, in characters). */
  readonly index?: number;
  /** Required for `position: 'before' | 'after'`. */
  readonly anchor?: string;
}

export interface DateRule {
  readonly type: 'date';
  readonly source: DateSource;
  /** Tokens: YYYY YY MM DD HH mm ss. Default: `YYYY-MM-DD`. */
  readonly format?: string;
  readonly position?: 'prefix' | 'suffix';
  /** Default: `_`. */
  readonly separator?: string;
}

export interface TemplateRule {
  readonly type: 'template';
  /** Tokens: `{name}`, `{parent}`, `{date[:fmt]}`, `{modified[:fmt]}`, `{created[:fmt]}`. */
  readonly template: string;
}

export type Rule =
  | ReplaceRule
  | AffixRule
  | CaseRule
  | SeparatorsRule
  | RemoveCharsRule
  | AccentsRule
  | CutRule
  | InsertRule
  | DateRule
  | TemplateRule;

export type RuleType = Rule['type'];

// ---------------------------------------------------------------------------
// Sequence numbering
// ---------------------------------------------------------------------------

export type SequenceScope = 'global' | 'perFolder' | 'perExtension';
export type OrderBy = 'name' | 'modified' | 'created' | 'exif' | 'size' | 'manual';

export interface SequenceOptions {
  readonly start: number;
  readonly step: number;
  /** `auto` = as many digits as the last number of the group needs. */
  readonly digits: 'auto' | number;
  readonly delimiter: string;
  readonly scope: SequenceScope;
  readonly orderBy: OrderBy;
  readonly reverse: boolean;
}

export interface FreeModeOptions extends SequenceOptions {
  /** Custom base name. Supports `{parent}`, `{date[:fmt]}`, `{modified[:fmt]}`, `{created[:fmt]}`. */
  readonly name: string;
}

// ---------------------------------------------------------------------------
// Preset (the JSON shared by CLI and, later, the web UI)
// ---------------------------------------------------------------------------

export interface Filters {
  /** Extensions without dot, case-insensitive. Empty = all. */
  readonly extensions: readonly string[];
  /** Glob patterns on the file name (`*` and `?`). Empty = all. */
  readonly include: readonly string[];
  readonly exclude: readonly string[];
  /** Optional regular expression on the full file name. */
  readonly nameRegex?: string;
  readonly recursive: boolean;
  readonly includeHidden: boolean;
  /** Safety cap on the number of files in a single batch. */
  readonly maxFiles: number;
}

export interface RulesPreset {
  readonly version: 1;
  readonly mode: 'rules';
  readonly rules: readonly Rule[];
  /** `null` = no numbering. */
  readonly sequence: SequenceOptions | null;
  readonly filters: Filters;
}

export interface FreePreset {
  readonly version: 1;
  readonly mode: 'free';
  readonly free: FreeModeOptions;
  readonly filters: Filters;
}

export type Preset = RulesPreset | FreePreset;

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export type Severity = 'error' | 'warning';

export type IssueCode =
  | 'EMPTY_NAME'
  | 'INVALID_CHARS'
  | 'RESERVED_NAME'
  | 'TRAILING_DOT_OR_SPACE'
  | 'NAME_TOO_LONG'
  | 'PATH_TOO_LONG'
  | 'SUSPICIOUS_UNICODE'
  | 'DUPLICATE_TARGET'
  | 'EXISTS_ON_DISK'
  | 'RULE_ERROR'
  | 'EXIF_MISSING';

export interface Issue {
  readonly code: IssueCode;
  readonly severity: Severity;
  readonly message: string;
}

export type PlanItemStatus = 'rename' | 'unchanged' | 'blocked';

export interface PlanItem {
  readonly entry: FileEntry;
  readonly sourcePath: string;
  readonly targetPath: string;
  readonly oldBase: string;
  readonly newBase: string;
  /** Sequence number assigned (formatted), if numbering is active. */
  readonly sequence: string | null;
  readonly status: PlanItemStatus;
  readonly issues: readonly Issue[];
}

export interface PlanSummary {
  readonly total: number;
  readonly toRename: number;
  readonly unchanged: number;
  readonly blocked: number;
  readonly warnings: number;
}

export interface RenamePlan {
  readonly items: readonly PlanItem[];
  readonly summary: PlanSummary;
  /** True if at least one item has an error: the plan must not be executed. */
  readonly hasBlockingIssues: boolean;
}
