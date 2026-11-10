import { assertNever } from '../errors.js';
import type { Rule } from '../types.js';
import {
  applyAccents,
  applyAffix,
  applyCase,
  applyCut,
  applyInsert,
  applyRemoveChars,
  applyReplace,
  applySeparators,
} from './apply-simple.js';
import { applyDate, applyTemplate } from './apply-contextual.js';
import type { RuleContext } from './context.js';

export type { RuleContext } from './context.js';
export { FREE_NAME_TOKENS, TEMPLATE_TOKENS, resolveDateToken } from './apply-contextual.js';
export { compileSafeRegExp, escapeRegExp, MAX_PATTERN_LENGTH } from './safe-regex.js';
export { formatDate, DEFAULT_DATE_FORMAT } from './date-format.js';
export { assertValidTemplate, expandTemplate } from './template.js';

/** Applies a single rule to the file name (extension excluded). */
export function applyRule(rule: Rule, name: string, ctx: RuleContext): string {
  switch (rule.type) {
    case 'replace':
      return applyReplace(rule, name);
    case 'affix':
      return applyAffix(rule, name);
    case 'case':
      return applyCase(rule, name);
    case 'separators':
      return applySeparators(rule, name);
    case 'removeChars':
      return applyRemoveChars(rule, name);
    case 'accents':
      return applyAccents(rule, name);
    case 'cut':
      return applyCut(rule, name);
    case 'insert':
      return applyInsert(rule, name);
    case 'date':
      return applyDate(rule, name, ctx);
    case 'template':
      return applyTemplate(rule, name, ctx);
    default:
      return assertNever(rule);
  }
}

/** Applies the rules in order: the output of each one is the input of the next. */
export function applyRules(rules: readonly Rule[], name: string, ctx: RuleContext): string {
  return rules.reduce((current, rule) => applyRule(rule, current, ctx), name);
}
