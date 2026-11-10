import { RenamerError, assertNever } from './errors.js';
import { naturalCompare } from './natural-sort.js';
export const MAX_SEQUENCE_START = 1_000_000_000;
export const MAX_SEQUENCE_STEP = 1_000_000;
export const MAX_FIXED_DIGITS = 12;
export function assertValidSequenceOptions(options) {
    const { start, step, digits } = options;
    if (!Number.isInteger(start) || start < 0 || start > MAX_SEQUENCE_START) {
        throw new RenamerError('SEQUENCE_INVALID', `Il primo numero deve essere un intero tra 0 e ${MAX_SEQUENCE_START}.`);
    }
    if (!Number.isInteger(step) || step < 1 || step > MAX_SEQUENCE_STEP) {
        throw new RenamerError('SEQUENCE_INVALID', `Il passo deve essere un intero tra 1 e ${MAX_SEQUENCE_STEP}.`);
    }
    if (digits !== 'auto' && (!Number.isInteger(digits) || digits < 1 || digits > MAX_FIXED_DIGITS)) {
        throw new RenamerError('SEQUENCE_INVALID', `Le cifre devono essere "auto" oppure un intero tra 1 e ${MAX_FIXED_DIGITS}.`);
    }
}
export function computeDigits(count, options) {
    if (options.digits !== 'auto') {
        return options.digits;
    }
    const last = options.start + Math.max(count - 1, 0) * options.step;
    return Math.max(String(options.start).length, String(last).length);
}
export function formatSequenceNumber(value, digits) {
    return String(value).padStart(digits, '0');
}
function groupKey(entry, scope) {
    switch (scope) {
        case 'global':
            return '';
        case 'perFolder':
            return entry.dir;
        case 'perExtension':
            return entry.ext.toLowerCase();
        default:
            return assertNever(scope);
    }
}
function sortValue(entry, orderBy) {
    switch (orderBy) {
        case 'modified':
            return entry.mtimeMs;
        case 'created':
            return entry.birthtimeMs;
        case 'exif':
            return entry.exifDateMs ?? entry.mtimeMs;
        case 'size':
            return entry.size;
        default:
            return assertNever(orderBy);
    }
}
export function orderEntries(entries, orderBy, reverse) {
    if (orderBy === 'manual') {
        return reverse ? [...entries].reverse() : [...entries];
    }
    const compare = (a, b) => {
        const primary = orderBy === 'name' ? naturalCompare(a.base, b.base) : sortValue(a, orderBy) - sortValue(b, orderBy);
        if (primary !== 0) {
            return primary;
        }
        return naturalCompare(a.base, b.base) || naturalCompare(a.dir, b.dir);
    };
    return [...entries].sort((a, b) => (reverse ? compare(b, a) : compare(a, b)));
}
export function assignSequence(entries, options) {
    assertValidSequenceOptions(options);
    const groups = new Map();
    for (const entry of entries) {
        const key = groupKey(entry, options.scope);
        const group = groups.get(key);
        if (group) {
            group.push(entry);
        }
        else {
            groups.set(key, [entry]);
        }
    }
    const keys = [...groups.keys()];
    if (options.orderBy !== 'manual') {
        keys.sort(naturalCompare);
    }
    const result = [];
    for (const key of keys) {
        const ordered = orderEntries(groups.get(key) ?? [], options.orderBy, options.reverse);
        const digits = computeDigits(ordered.length, options);
        ordered.forEach((entry, position) => {
            result.push({
                entry,
                sequence: formatSequenceNumber(options.start + position * options.step, digits),
            });
        });
    }
    return result;
}
