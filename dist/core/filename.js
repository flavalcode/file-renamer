const COMPOUND_EXTENSIONS = [
    '.tar.gz',
    '.tar.bz2',
    '.tar.xz',
    '.tar.zst',
    '.tar.lz',
    '.tar.lzma',
    '.tar.br',
    '.tar.z',
];
const EXTENSION_PATTERN = /^\.[^\s./\\:]{1,16}$/u;
export function splitFileName(base) {
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
export function toNfc(text) {
    return text.normalize('NFC');
}
export function collisionKey(base) {
    return toNfc(base).toLowerCase();
}
export function codePointLength(text) {
    let count = 0;
    for (const _ of text) {
        count += 1;
    }
    return count;
}
