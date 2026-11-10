import { RuleError } from '../errors.js';

/**
 * User-supplied regular expressions are a ReDoS risk (catastrophic
 * backtracking would freeze the process). Node has no regex timeout, so we
 * apply conservative limits instead:
 *
 * 1. maximum pattern length,
 * 2. the `u` flag is always on (stricter syntax),
 * 3. patterns with an unbounded quantifier applied to a group that itself
 *    contains a quantifier or an alternation - e.g. `(a+)+`, `(a|aa)*` - are rejected.
 *
 * The check is a heuristic: it rejects the classic exponential shapes but is
 * not a formal proof. Names are at most 255 characters, which bounds the rest.
 */

export const MAX_PATTERN_LENGTH = 200;

interface GroupState {
  hasQuantifier: boolean;
  hasAlternation: boolean;
}

const UNBOUNDED_BRACE = /^\{\d+,\}/u;
const ANY_RANGE_BRACE = /^\{\d+,\d*\}/u;

function isUnboundedQuantifierAt(pattern: string, index: number): boolean {
  const char = pattern[index];
  return char === '*' || char === '+' || (char === '{' && UNBOUNDED_BRACE.test(pattern.slice(index)));
}

function assertNoCatastrophicShape(pattern: string): void {
  const stack: GroupState[] = [];
  let inClass = false;

  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === '\\') {
      i += 1; // skip the escaped character
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
          throw new RuleError(
            'Espressione regolare non consentita: quantificatori annidati possono bloccare il programma.',
          );
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

/** Compiles a user pattern after safety checks. Always adds the `u` flag. */
export function compileSafeRegExp(pattern: string, flags: string): RegExp {
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
  } catch (error) {
    throw new RuleError(
      `Espressione regolare non valida: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
