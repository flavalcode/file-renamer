const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/**
 * "Natural" comparison: `file2` comes before `file10`, case and accents are
 * ignored for the primary ordering. Ties are broken by raw code-unit order so
 * the result is fully deterministic on every machine.
 */
export function naturalCompare(a: string, b: string): number {
  const result = collator.compare(a, b);
  if (result !== 0) {
    return result;
  }
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}
