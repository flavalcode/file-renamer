import type { AccentsRule, AffixRule, CaseRule, CutRule, InsertRule, RemoveCharsRule, ReplaceRule, SeparatorsRule } from '../types.js';
export declare function applyReplace(rule: ReplaceRule, name: string): string;
export declare function applyAffix(rule: AffixRule, name: string): string;
export declare function applyCase(rule: CaseRule, name: string): string;
export declare function applySeparators(rule: SeparatorsRule, name: string): string;
export declare function applyRemoveChars(rule: RemoveCharsRule, name: string): string;
export declare function applyAccents(_rule: AccentsRule, name: string): string;
export declare function applyCut(rule: CutRule, name: string): string;
export declare function applyInsert(rule: InsertRule, name: string): string;
