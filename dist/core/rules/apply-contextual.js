import { RuleError } from '../errors.js';
import { DEFAULT_DATE_FORMAT, formatDate } from './date-format.js';
import { expandTemplate } from './template.js';
export const TEMPLATE_TOKENS = ['name', 'parent', 'date', 'modified', 'created'];
export const FREE_NAME_TOKENS = ['parent', 'date', 'modified', 'created'];
export function resolveDateToken(token, argument, ctx) {
    const format = argument ?? DEFAULT_DATE_FORMAT;
    switch (token) {
        case 'date':
            return formatDate(ctx.now.getTime(), format);
        case 'modified':
            return formatDate(ctx.entry.mtimeMs, format);
        case 'created':
            return formatDate(ctx.entry.birthtimeMs, format);
        default:
            throw new RuleError(`Token data sconosciuto {${token}}.`);
    }
}
export function applyDate(rule, name, ctx) {
    let epochMs;
    switch (rule.source) {
        case 'modified':
            epochMs = ctx.entry.mtimeMs;
            break;
        case 'created':
            epochMs = ctx.entry.birthtimeMs;
            break;
        case 'today':
            epochMs = ctx.now.getTime();
            break;
        case 'exif':
            if (ctx.entry.exifDateMs === undefined || ctx.entry.exifDateMs === null) {
                ctx.warn({
                    code: 'EXIF_MISSING',
                    message: 'Data EXIF non disponibile: usata la data di modifica.',
                });
                epochMs = ctx.entry.mtimeMs;
            }
            else {
                epochMs = ctx.entry.exifDateMs;
            }
            break;
    }
    const stamp = formatDate(epochMs, rule.format ?? DEFAULT_DATE_FORMAT);
    const separator = rule.separator ?? '_';
    return rule.position === 'suffix' ? `${name}${separator}${stamp}` : `${stamp}${separator}${name}`;
}
export function applyTemplate(rule, name, ctx) {
    return expandTemplate(rule.template, TEMPLATE_TOKENS, (token, argument) => token === 'name'
        ? name
        : token === 'parent'
            ? ctx.parentName
            : resolveDateToken(token, argument, ctx));
}
