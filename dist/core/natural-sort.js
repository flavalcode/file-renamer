const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
export function naturalCompare(a, b) {
    const result = collator.compare(a, b);
    if (result !== 0) {
        return result;
    }
    if (a < b) {
        return -1;
    }
    return a > b ? 1 : 0;
}
