import { checkbox, field, h, select } from './dom.js';
import { DELIMITER_CHOICES, DIGIT_CHOICES, ORDER_CHOICES, SCOPE_CHOICES } from './preset-builder.js';
function textInput(value, label, onInput, attrs = {}) {
    const input = h('input', { type: 'text', value, 'aria-label': label, autocomplete: 'off', spellcheck: 'false', ...attrs });
    input.addEventListener('input', () => onInput(input.value));
    return input;
}
export function renderNumberingForm(numbering, onChange) {
    const customInput = textInput(numbering.delimiterCustom, 'Delimitatore personalizzato', (value) => {
        numbering.delimiterCustom = value;
        onChange();
    }, { maxlength: '10', class: 'narrow' });
    customInput.hidden = numbering.delimiter !== 'custom';
    const delimiter = select(DELIMITER_CHOICES, numbering.delimiter, (value) => {
        numbering.delimiter = value;
        customInput.hidden = value !== 'custom';
        onChange();
    });
    const start = textInput(numbering.start, 'Primo numero', (value) => {
        numbering.start = value;
        onChange();
    }, { inputmode: 'numeric', class: 'narrow' });
    const digits = select(DIGIT_CHOICES, numbering.digits, (value) => {
        numbering.digits = value;
        onChange();
    });
    const step = textInput(numbering.step, 'Passo', (value) => {
        numbering.step = value;
        onChange();
    }, { inputmode: 'numeric', class: 'narrow' });
    return h('div', { class: 'numbering' }, h('div', { class: 'grid' }, field('Delimitatore prima del numero', h('span', { class: 'inline' }, delimiter, customInput)), field('Primo numero', start), field('Cifre', digits)), h('details', { class: 'advanced' }, h('summary', {}, 'Altre opzioni di numerazione'), h('div', { class: 'grid' }, field('Passo (di quanto cresce il numero)', step), field('Ordine di assegnazione', select(ORDER_CHOICES, numbering.orderBy, (value) => {
        numbering.orderBy = value;
        onChange();
    })), field('Ambito', select(SCOPE_CHOICES, numbering.scope, (value) => {
        numbering.scope = value;
        onChange();
    })), checkbox('Ordine inverso', numbering.reverse, (value) => {
        numbering.reverse = value;
        onChange();
    }))));
}
