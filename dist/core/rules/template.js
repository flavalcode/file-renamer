import { RuleError } from '../errors.js';
const TOKEN_PATTERN = /\{\{|\}\}|\{([a-z]+)(?::([^{}]*))?\}/gu;
export const MAX_TEMPLATE_LENGTH = 255;
export function expandTemplate(template, allowedTokens, resolve) {
    if (template.length > MAX_TEMPLATE_LENGTH) {
        throw new RuleError(`Template troppo lungo (massimo ${MAX_TEMPLATE_LENGTH} caratteri).`);
    }
    let output = '';
    let cursor = 0;
    for (const match of template.matchAll(TOKEN_PATTERN)) {
        const index = match.index ?? 0;
        output += assertNoStrayBraces(template.slice(cursor, index));
        cursor = index + match[0].length;
        if (match[0] === '{{') {
            output += '{';
        }
        else if (match[0] === '}}') {
            output += '}';
        }
        else {
            const token = match[1] ?? '';
            if (!allowedTokens.includes(token)) {
                throw new RuleError(`Token sconosciuto {${token}}. Token ammessi: ${allowedTokens.map((t) => `{${t}}`).join(', ')}.`);
            }
            output += resolve(token, match[2]);
        }
    }
    output += assertNoStrayBraces(template.slice(cursor));
    return output;
}
function assertNoStrayBraces(text) {
    if (/[{}]/u.test(text)) {
        throw new RuleError('Parentesi graffa non valida nel template (usa {{ e }} per le graffe letterali).');
    }
    return text;
}
export function assertValidTemplate(template, allowedTokens) {
    expandTemplate(template, allowedTokens, () => '');
}
