import { codePointLength } from '../filename.js';
import { RuleError } from '../errors.js';
import { escapeRegExp, compileSafeRegExp } from './safe-regex.js';
export function applyReplace(rule, name) {
    const flags = `${rule.all === false ? '' : 'g'}${rule.caseSensitive === false ? 'i' : ''}`;
    if (rule.regex === true) {
        return name.replace(compileSafeRegExp(rule.find, flags), rule.with);
    }
    if (rule.find.length === 0) {
        throw new RuleError('Il testo da cercare non può essere vuoto.');
    }
    return name.replace(new RegExp(escapeRegExp(rule.find), `${flags}u`), () => rule.with);
}
export function applyAffix(rule, name) {
    return `${rule.prefix ?? ''}${name}${rule.suffix ?? ''}`;
}
export function applyCase(rule, name) {
    switch (rule.mode) {
        case 'lower':
            return name.toLowerCase();
        case 'upper':
            return name.toUpperCase();
        case 'title':
            return name
                .toLowerCase()
                .replace(/(^|[\s_\-.])(\p{L})/gu, (_all, lead, letter) => lead + letter.toUpperCase());
        case 'sentence':
            return name.toLowerCase().replace(/\p{L}/u, (letter) => letter.toUpperCase());
    }
}
const SPACE_REPLACEMENT = {
    keep: null,
    underscore: '_',
    dash: '-',
    dot: '.',
    remove: '',
};
export function applySeparators(rule, name) {
    let result = name;
    const replacement = SPACE_REPLACEMENT[rule.spaces ?? 'keep'];
    if (replacement !== null) {
        result = result.replace(/\s/gu, replacement);
    }
    if (rule.collapse === true) {
        result = result.replace(/([ _.-])\1+/gu, '$1');
    }
    if (rule.trim === true) {
        result = result.replace(/^[\s_.-]+|[\s_.-]+$/gu, '');
    }
    return result;
}
export function applyRemoveChars(rule, name) {
    let result = name;
    if (rule.brackets === true) {
        for (let pass = 0; pass < 5; pass += 1) {
            const next = result.replace(/\s*[(\[{][^()[\]{}]*[)\]}]/gu, '');
            if (next === result) {
                break;
            }
            result = next;
        }
    }
    if (rule.digits === true) {
        result = result.replace(/\p{Nd}/gu, '');
    }
    if (rule.punctuation === true) {
        result = result.replace(/[\p{P}\p{S}]/gu, '');
    }
    if (rule.emoji === true) {
        result = result.replace(/[\p{Extended_Pictographic}\u200D\uFE0F]/gu, '');
    }
    if (rule.custom !== undefined && rule.custom.length > 0) {
        const blocked = new Set(Array.from(rule.custom));
        result = Array.from(result)
            .filter((char) => !blocked.has(char))
            .join('');
    }
    return result;
}
const SPECIAL_LETTERS = {
    ß: 'ss',
    æ: 'ae',
    Æ: 'AE',
    œ: 'oe',
    Œ: 'OE',
    ø: 'o',
    Ø: 'O',
    ł: 'l',
    Ł: 'L',
    đ: 'd',
    Đ: 'D',
};
export function applyAccents(_rule, name) {
    const stripped = name.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
    return Array.from(stripped)
        .map((char) => SPECIAL_LETTERS[char] ?? char)
        .join('');
}
export function applyCut(rule, name) {
    const chars = Array.from(name);
    const start = Math.min(Math.max(rule.fromStart ?? 0, 0), chars.length);
    const end = Math.max(chars.length - Math.max(rule.fromEnd ?? 0, 0), start);
    return chars.slice(start, end).join('');
}
export function applyInsert(rule, name) {
    switch (rule.position) {
        case 'start':
            return rule.text + name;
        case 'end':
            return name + rule.text;
        case 'index': {
            const chars = Array.from(name);
            const index = Math.min(Math.max(rule.index ?? 0, 0), codePointLength(name));
            return chars.slice(0, index).join('') + rule.text + chars.slice(index).join('');
        }
        case 'before':
        case 'after': {
            const anchor = rule.anchor ?? '';
            if (anchor.length === 0) {
                throw new RuleError('Per inserire prima/dopo un testo serve un testo di riferimento (anchor).');
            }
            const at = name.indexOf(anchor);
            if (at === -1) {
                return name;
            }
            const cut = rule.position === 'before' ? at : at + anchor.length;
            return name.slice(0, cut) + rule.text + name.slice(cut);
        }
    }
}
