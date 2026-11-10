import { RuleError } from '../errors.js';
export const MAX_PATTERN_LENGTH = 200;
const UNBOUNDED_BRACE = /^\{\d+,\}/u;
const ANY_RANGE_BRACE = /^\{\d+,\d*\}/u;
function isUnboundedQuantifierAt(pattern, index) {
    const char = pattern[index];
    return char === '*' || char === '+' || (char === '{' && UNBOUNDED_BRACE.test(pattern.slice(index)));
}
function assertNoCatastrophicShape(pattern) {
    const stack = [];
    let inClass = false;
    for (let i = 0; i < pattern.length; i += 1) {
        const char = pattern[i];
        if (char === '\\') {
            i += 1;
            continue;
        }
        if (inClass) {
            inClass = char !== ']';
            continue;
        }
        const top = stack[stack.length - 1];
        switch (char) {
            case '[':
                inClass = true;
                break;
            case '(':
                stack.push({ hasQuantifier: false, hasAlternation: false });
                break;
            case '|':
                if (top) {
                    top.hasAlternation = true;
                }
                break;
            case ')': {
                const group = stack.pop();
                const unbounded = isUnboundedQuantifierAt(pattern, i + 1);
                if (group && unbounded && (group.hasQuantifier || group.hasAlternation)) {
                    throw new RuleError('Espressione regolare non consentita: quantificatori annidati possono bloccare il programma.');
                }
                const parent = stack[stack.length - 1];
                if (parent && (group?.hasQuantifier || unbounded)) {
                    parent.hasQuantifier = true;
                }
                break;
            }
            case '*':
            case '+':
                if (top) {
                    top.hasQuantifier = true;
                }
                break;
            case '{':
                if (top && ANY_RANGE_BRACE.test(pattern.slice(i))) {
                    top.hasQuantifier = true;
                }
                break;
            default:
                break;
        }
    }
}
export function compileSafeRegExp(pattern, flags) {
    if (pattern.length === 0) {
        throw new RuleError('Espressione regolare vuota.');
    }
    if (pattern.length > MAX_PATTERN_LENGTH) {
        throw new RuleError(`Espressione regolare troppo lunga (massimo ${MAX_PATTERN_LENGTH} caratteri).`);
    }
    assertNoCatastrophicShape(pattern);
    const finalFlags = flags.includes('u') ? flags : `${flags}u`;
    try {
        return new RegExp(pattern, finalFlags);
    }
    catch (error) {
        throw new RuleError(`Espressione regolare non valida: ${error instanceof Error ? error.message : String(error)}`);
    }
}
export function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
