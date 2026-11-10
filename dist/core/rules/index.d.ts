import type { Rule } from '../types.js';
import type { RuleContext } from './context.js';
export type { RuleContext } from './context.js';
export { FREE_NAME_TOKENS, TEMPLATE_TOKENS, resolveDateToken } from './apply-contextual.js';
export { compileSafeRegExp, escapeRegExp, MAX_PATTERN_LENGTH } from './safe-regex.js';
export { formatDate, DEFAULT_DATE_FORMAT } from './date-format.js';
export { assertValidTemplate, expandTemplate } from './template.js';
export declare function applyRule(rule: Rule, name: string, ctx: RuleContext): string;
export declare function applyRules(rules: readonly Rule[], name: string, ctx: RuleContext): string;
