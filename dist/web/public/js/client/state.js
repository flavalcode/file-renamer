import { defaultForm } from './preset-builder.js';
export function initialState() {
    return {
        step: 1,
        info: null,
        path: '',
        options: { recursive: false, includeHidden: false, extensions: '' },
        scan: null,
        excluded: new Set(),
        form: defaultForm(),
        plan: null,
        outcome: null,
        notice: null,
    };
}
export function parseExtensions(text) {
    return text
        .split(/[\s,;]+/u)
        .map((part) => part.trim().replace(/^\./u, ''))
        .filter((part) => part.length > 0);
}
