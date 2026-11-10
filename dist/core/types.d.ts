export interface FileEntry {
    readonly dir: string;
    readonly base: string;
    readonly name: string;
    readonly ext: string;
    readonly size: number;
    readonly mtimeMs: number;
    readonly birthtimeMs: number;
    readonly exifDateMs?: number | null;
}
export type DateSource = 'modified' | 'created' | 'exif' | 'today';
export interface ReplaceRule {
    readonly type: 'replace';
    readonly find: string;
    readonly with: string;
    readonly regex?: boolean;
    readonly caseSensitive?: boolean;
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
    readonly spaces?: 'keep' | 'underscore' | 'dash' | 'dot' | 'remove';
    readonly collapse?: boolean;
    readonly trim?: boolean;
}
export interface RemoveCharsRule {
    readonly type: 'removeChars';
    readonly digits?: boolean;
    readonly punctuation?: boolean;
    readonly emoji?: boolean;
    readonly brackets?: boolean;
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
    readonly index?: number;
    readonly anchor?: string;
}
export interface DateRule {
    readonly type: 'date';
    readonly source: DateSource;
    readonly format?: string;
    readonly position?: 'prefix' | 'suffix';
    readonly separator?: string;
}
export interface TemplateRule {
    readonly type: 'template';
    readonly template: string;
}
export type Rule = ReplaceRule | AffixRule | CaseRule | SeparatorsRule | RemoveCharsRule | AccentsRule | CutRule | InsertRule | DateRule | TemplateRule;
export type RuleType = Rule['type'];
export type SequenceScope = 'global' | 'perFolder' | 'perExtension';
export type OrderBy = 'name' | 'modified' | 'created' | 'exif' | 'size' | 'manual';
export interface SequenceOptions {
    readonly start: number;
    readonly step: number;
    readonly digits: 'auto' | number;
    readonly delimiter: string;
    readonly scope: SequenceScope;
    readonly orderBy: OrderBy;
    readonly reverse: boolean;
}
export interface FreeModeOptions extends SequenceOptions {
    readonly name: string;
}
export interface Filters {
    readonly extensions: readonly string[];
    readonly include: readonly string[];
    readonly exclude: readonly string[];
    readonly nameRegex?: string;
    readonly recursive: boolean;
    readonly includeHidden: boolean;
    readonly maxFiles: number;
}
export interface RulesPreset {
    readonly version: 1;
    readonly mode: 'rules';
    readonly rules: readonly Rule[];
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
export type Severity = 'error' | 'warning';
export type IssueCode = 'EMPTY_NAME' | 'INVALID_CHARS' | 'RESERVED_NAME' | 'TRAILING_DOT_OR_SPACE' | 'NAME_TOO_LONG' | 'PATH_TOO_LONG' | 'SUSPICIOUS_UNICODE' | 'DUPLICATE_TARGET' | 'EXISTS_ON_DISK' | 'RULE_ERROR' | 'EXIF_MISSING';
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
    readonly hasBlockingIssues: boolean;
}
