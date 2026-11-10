import { RuleError } from '../errors.js';

/**
 * Mini template engine: `{token}` or `{token:argument}`; `{{` and `}}` are
 * literal braces. Expansion is SINGLE-PASS: values inserted by a token are
 * never parsed again, so a file called `{parent}.txt` cannot inject tokens.
 */

const TOKEN_PATTERN = /\{\{|\}\}|\{([a-z]+)(?::([^{}]*))?\}/gu;

export const MAX_TEMPLATE_LENGTH = 255;

export type TokenResolver = (token: string, argument: string | undefined) => string;

export function expandTemplate(
  template: string,
  allowedTokens: readonly string[],
  resolve: TokenResolver,
): string {
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
    } else if (match[0] === '}}') {
      output += '}';
    } else {
      const token = match[1] ?? '';
      if (!allowedTokens.includes(token)) {
        throw new RuleError(
          `Token sconosciuto {${token}}. Token ammessi: ${allowedTokens.map((t) => `{${t}}`).join(', ')}.`,
        );
      }
      output += resolve(token, match[2]);
    }
  }
  output += assertNoStrayBraces(template.slice(cursor));
  return output;
}

function assertNoStrayBraces(text: string): string {
  if (/[{}]/u.test(text)) {
    throw new RuleError('Parentesi graffa non valida nel template (usa {{ e }} per le graffe letterali).');
  }
  return text;
}

/** Throws a RuleError if the template is malformed (used at preset-validation time). */
export function assertValidTemplate(template: string, allowedTokens: readonly string[]): void {
  expandTemplate(template, allowedTokens, () => '');
}
