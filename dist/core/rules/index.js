import { assertNever } from '../errors.js';
import { applyAccents, applyAffix, applyCase, applyCut, applyInsert, applyRemoveChars, applyReplace, applySeparators, } from './apply-simple.js';
import { applyDate, applyTemplate } from './apply-contextual.js';
export { FREE_NAME_TOKENS, TEMPLATE_TOKENS, resolveDateToken } from './apply-contextual.js';
export { compileSafeRegExp, escapeRegExp, MAX_PATTERN_LENGTH } from './safe-regex.js';
export { formatDate, DEFAULT_DATE_FORMAT } from './date-format.js';
export { assertValidTemplate, expandTemplate } from './template.js';
export function applyRule(rule, name, ctx) {
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
export function applyRules(rules, name, ctx) {
    return rules.reduce((current, rule) => applyRule(rule, current, ctx), name);
}
