import { lstat, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { RenamerError } from '../core/errors.js';
import { splitFileName } from '../core/filename.js';
import { compileSafeRegExp, escapeRegExp } from '../core/rules/index.js';
import { EXIF_EXTENSIONS, readExifDate } from './exif.js';
export const MAX_SCAN_DEPTH = 32;
const SYSTEM_FILES = new Set(['thumbs.db', 'desktop.ini', 'icon\r']);
export function isHiddenName(name) {
    return name.startsWith('.') || name.startsWith('~$') || SYSTEM_FILES.has(name.toLowerCase());
}
export function globToRegExp(glob) {
    const source = Array.from(glob)
        .map((char) => (char === '*' ? '[^/\\\\]*' : char === '?' ? '[^/\\\\]' : escapeRegExp(char)))
        .join('');
    return new RegExp(`^${source}$`, 'iu');
}
function buildMatcher(filters) {
    const extensions = filters.extensions.map((e) => e.toLowerCase());
    const include = filters.include.map(globToRegExp);
    const exclude = filters.exclude.map(globToRegExp);
    const nameRegex = filters.nameRegex ? compileSafeRegExp(filters.nameRegex, 'i') : null;
    return ({ base, ext }) => {
        const lowerExt = ext.replace(/^\./u, '').toLowerCase();
        if (extensions.length > 0 && !extensions.some((e) => lowerExt === e || lowerExt.endsWith(`.${e}`))) {
            return false;
        }
        if (include.length > 0 && !include.some((re) => re.test(base)))
            return false;
        if (exclude.some((re) => re.test(base)))
            return false;
        return nameRegex ? nameRegex.test(base) : true;
    };
}
export async function scanDirectory(rootInput, options) {
    const { filters } = options;
    const root = await realpath(path.resolve(rootInput)).catch(() => {
        throw new RenamerError('SCAN_ROOT', `Cartella non trovata: ${rootInput}`);
    });
    if (!(await lstat(root)).isDirectory()) {
        throw new RenamerError('SCAN_ROOT', `Non è una cartella: ${rootInput}`);
    }
    const matches = buildMatcher(filters);
    const entries = [];
    const siblings = new Map();
    const skipped = { hidden: 0, symlinks: 0, filtered: 0 };
    const pending = [{ dir: root, depth: 0 }];
    while (pending.length > 0) {
        const { dir, depth } = pending.pop();
        const dirents = await readdir(dir, { withFileTypes: true });
        siblings.set(dir, dirents.map((d) => d.name));
        for (const dirent of dirents) {
            const full = path.join(dir, dirent.name);
            if (dirent.isSymbolicLink()) {
                skipped.symlinks += 1;
                continue;
            }
            if (!filters.includeHidden && isHiddenName(dirent.name)) {
                skipped.hidden += 1;
                continue;
            }
            if (dirent.isDirectory()) {
                if (filters.recursive && depth < MAX_SCAN_DEPTH) {
                    pending.push({ dir: full, depth: depth + 1 });
                }
                continue;
            }
            if (!dirent.isFile()) {
                continue;
            }
            const { name, ext } = splitFileName(dirent.name);
            if (!matches({ base: dirent.name, ext })) {
                skipped.filtered += 1;
                continue;
            }
            if (entries.length >= filters.maxFiles) {
                throw new RenamerError('SCAN_LIMIT', `Troppi file (limite ${filters.maxFiles}). Restringi i filtri o aumenta "maxFiles".`);
            }
            const stats = await lstat(full);
            const exifDateMs = options.loadExif === true && EXIF_EXTENSIONS.includes(ext.toLowerCase())
                ? await readExifDate(full)
                : null;
            entries.push({
                dir,
                base: dirent.name,
                name,
                ext,
                size: stats.size,
                mtimeMs: stats.mtimeMs,
                birthtimeMs: stats.birthtimeMs > 0 ? stats.birthtimeMs : stats.mtimeMs,
                exifDateMs,
            });
        }
    }
    return { root, entries, siblings, skipped };
}
