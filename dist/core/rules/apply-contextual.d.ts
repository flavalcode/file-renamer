import type { RuleContext } from './context.js';
import type { DateRule, TemplateRule } from '../types.js';
export declare const TEMPLATE_TOKENS: readonly ["name", "parent", "date", "modified", "created"];
export declare const FREE_NAME_TOKENS: readonly ["parent", "date", "modified", "created"];
export declare function resolveDateToken(token: string, argument: string | undefined, ctx: RuleContext): string;
export declare function applyDate(rule: DateRule, name: string, ctx: RuleContext): string;
export declare function applyTemplate(rule: TemplateRule, name: string, ctx: RuleContext): string;
