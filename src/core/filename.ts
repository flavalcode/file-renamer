/**
 * File name helpers. The extension is split off here once and then re-attached
 * unchanged by the planner: rules never see it, so they cannot alter it.
 */

const COMPOUND_EXTENSIONS = [
  '.tar.gz',
  '.tar.bz2',
  '.tar.xz',
  '.tar.zst',
  '.tar.lz',
  '.tar.lzma',
  '.tar.br',
  '.tar.z',
] as const;

/** A "real" extension: 1-16 characters, no whitespace, no separators. */
const EXTENSION_PATTERN = /^\.[^\s./\\:]{1,16}$/u;

export interface SplitName {
  readonly name: string;
  readonly ext: string;
}

/**
 * Splits a file name into stem and extension.
 *
 * - `a.tar.gz`   -> `a` + `.tar.gz`
 * - `.DS_Store`  -> `.DS_Store` + `` (hidden file, no extension)
 * - `Report v1.5 final` -> no extension (text after the dot contains spaces)
 * - `file.`      -> no extension
 */
export function splitFileName(base: string): SplitName {
  const lower = base.toLowerCase();
  for (const compound of COMPOUND_EXTENSIONS) {
    if (lower.endsWith(compound) && base.length > compound.length) {
      const cut = base.length - compound.length;
      return { name: base.slice(0, cut), ext: base.slice(cut) };
    }
  }

  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) {
    return { name: base, ext: '' };
  }
  const ext = base.slice(dot);
  if (!EXTENSION_PATTERN.test(ext)) {
    return { name: base, ext: '' };
  }
  return { name: base.slice(0, dot), ext };
}

/** Unicode canonical composition (NFC): macOS may hand out NFD names. */
export function toNfc(text: string): string {
  return text.normalize('NFC');
}

/**
 * Key used to compare names for collisions. It is deliberately conservative:
 * NFC + lower case, because macOS and Windows file systems are case-insensitive
 * by default, and we want the same preset to be safe on both.
 */
export function collisionKey(base: string): string {
  return toNfc(base).toLowerCase();
}

/** Number of Unicode code points (not UTF-16 units). */
export function codePointLength(text: string): number {
  let count = 0;
  for (const _ of text) {
    count += 1;
  }
  return count;
}
