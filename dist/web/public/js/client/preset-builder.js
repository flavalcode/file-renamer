import { RULE_SCHEMAS, schemaFor } from './rule-schemas.js';
export const DELIMITER_CHOICES = [
    { value: '_', label: '_  (trattino basso)' },
    { value: '-', label: '-  (trattino)' },
    { value: ' ', label: '(spazio)' },
    { value: '.', label: '.  (punto)' },
    { value: '', label: '(nessuno)' },
    { value: 'custom', label: 'Personalizzato…' },
];
export const ORDER_CHOICES = [
    { value: 'name', label: 'Nome (ordine naturale: 2 prima di 10)' },
    { value: 'modified', label: 'Data di modifica' },
    { value: 'created', label: 'Data di creazione' },
    { value: 'exif', label: 'Data di scatto (EXIF)' },
    { value: 'size', label: 'Dimensione' },
];
export const SCOPE_CHOICES = [
    { value: 'global', label: 'Una sola sequenza per tutti i file' },
    { value: 'perFolder', label: 'Riparte in ogni cartella' },
    { value: 'perExtension', label: 'Riparte per ogni tipo di file' },
];
export const DIGIT_CHOICES = [
    { value: 'auto', label: 'Automatiche (1, 01, 001…)' },
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `${n} ${n === 1 ? 'cifra' : 'cifre'} fisse` })),
];
export function defaultNumbering() {
    return {
        start: '1',
        step: '1',
        digits: 'auto',
        delimiter: '_',
        delimiterCustom: '',
        scope: 'global',
        orderBy: 'name',
        reverse: false,
    };
}
export function defaultForm() {
    return { mode: 'free', freeName: '', numbering: defaultNumbering(), rulesNumbering: true, rules: [] };
}
let nextUid = 1;
export function newRule(type) {
    const schema = schemaFor(type);
    const values = {};
    for (const field of schema?.fields ?? []) {
        values[field.key] = field.initial ?? (field.kind === 'bool' ? false : '');
    }
    const uid = nextUid;
    nextUid += 1;
    return { uid, type, values };
}
const INTEGER = /^-?\d+$/u;
function toNumber(raw) {
    const text = raw.trim();
    return INTEGER.test(text) ? Number(text) : text;
}
function isVisible(field, values) {
    if (!field.showIf)
        return true;
    const current = values[field.showIf.key];
    return typeof current === 'string' && field.showIf.in.includes(current);
}
export function buildRule(draft) {
    const rule = { type: draft.type };
    const schema = schemaFor(draft.type);
    for (const field of schema?.fields ?? []) {
        if (!isVisible(field, draft.values))
            continue;
        const value = draft.values[field.key];
        if (field.kind === 'bool') {
            rule[field.key] = value === true;
        }
        else if (typeof value === 'string') {
            if (field.kind === 'int') {
                if (value.trim() !== '')
                    rule[field.key] = toNumber(value);
            }
            else if (value !== '' || field.allowEmpty === true) {
                rule[field.key] = value;
            }
        }
    }
    return rule;
}
export function buildSequence(numbering) {
    const sequence = {};
    if (numbering.start.trim() !== '')
        sequence['start'] = toNumber(numbering.start);
    if (numbering.step.trim() !== '')
        sequence['step'] = toNumber(numbering.step);
    sequence['digits'] = numbering.digits === 'auto' ? 'auto' : toNumber(numbering.digits);
    sequence['delimiter'] = numbering.delimiter === 'custom' ? numbering.delimiterCustom : numbering.delimiter;
    sequence['scope'] = numbering.scope;
    sequence['orderBy'] = numbering.orderBy;
    sequence['reverse'] = numbering.reverse;
    return sequence;
}
export function buildPresetInput(form) {
    if (form.mode === 'free') {
        return { version: 1, mode: 'free', free: { name: form.freeName, ...buildSequence(form.numbering) } };
    }
    return {
        version: 1,
        mode: 'rules',
        rules: form.rules.map(buildRule),
        sequence: form.rulesNumbering ? buildSequence(form.numbering) : null,
    };
}
const FREE_LABELS = {
    name: 'Nome',
    start: 'Primo numero',
    step: 'Passo',
    digits: 'Cifre',
    delimiter: 'Delimitatore',
    scope: 'Ambito della sequenza',
    orderBy: 'Ordine',
    reverse: 'Ordine inverso',
};
export function describeIssue(issue, form) {
    const free = /^\$\.(?:free|sequence)\.(\w+)(?:\[\d+\])?: (.*)$/su.exec(issue);
    if (free) {
        return `${FREE_LABELS[free[1] ?? ''] ?? free[1] ?? ''}: ${free[2] ?? ''}`;
    }
    const rule = /^\$\.rules\[(\d+)\]\.(\w+)(?:\[\d+\])?: (.*)$/su.exec(issue);
    if (rule) {
        const index = Number(rule[1]);
        const draft = form.rules[index];
        const schema = draft ? schemaFor(draft.type) : undefined;
        const label = schema?.fields.find((f) => f.key === rule[2])?.label ?? rule[2] ?? '';
        return `Regola ${index + 1}${schema ? ` (${schema.label})` : ''} – ${label}: ${rule[3] ?? ''}`;
    }
    const rules = /^\$\.rules\[(\d+)\]: (.*)$/su.exec(issue);
    if (rules)
        return `Regola ${Number(rules[1]) + 1}: ${rules[2] ?? ''}`;
    if (issue.startsWith('$.rules: '))
        return `Regole: ${issue.slice('$.rules: '.length)}`;
    return issue.replace(/^\$\.?/u, '');
}
export function ruleTypes() {
    return RULE_SCHEMAS.map((schema) => schema.type);
}
