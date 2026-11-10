import { RuleError } from '../errors.js';

/** Supported tokens: YYYY, YY, MM, DD, HH, mm, ss (local time). */
const TOKENS = /YYYY|YY|MM|DD|HH|mm|ss/gu;

export const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD';
export const MAX_DATE_FORMAT_LENGTH = 40;

const two = (value: number): string => String(value).padStart(2, '0');

export function assertValidDateFormat(format: string): void {
  if (format.length === 0 || format.length > MAX_DATE_FORMAT_LENGTH) {
    throw new RuleError(`Formato data non valido (1-${MAX_DATE_FORMAT_LENGTH} caratteri).`);
  }
}

export function formatDate(epochMs: number, format: string = DEFAULT_DATE_FORMAT): string {
  assertValidDateFormat(format);
  const date = new Date(epochMs);
  if (Number.isNaN(date.getTime())) {
    throw new RuleError('Data non valida.');
  }
  return format.replace(TOKENS, (token) => {
    switch (token) {
      case 'YYYY':
        return String(date.getFullYear()).padStart(4, '0');
      case 'YY':
        return two(date.getFullYear() % 100);
      case 'MM':
        return two(date.getMonth() + 1);
      case 'DD':
        return two(date.getDate());
      case 'HH':
        return two(date.getHours());
      case 'mm':
        return two(date.getMinutes());
      default:
        return two(date.getSeconds());
    }
  });
}
