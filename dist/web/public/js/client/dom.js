export function h(tag, props = {}, ...children) {
    const element = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
        if (value === undefined || value === null || value === false)
            continue;
        if (key.startsWith('on') && typeof value === 'function') {
            element.addEventListener(key.slice(2).toLowerCase(), value);
        }
        else if (key === 'value') {
            element.value = String(value);
        }
        else if (key === 'checked') {
            element.checked = value === true;
        }
        else if (key === 'disabled') {
            element.disabled = value === true;
        }
        else if (value === true) {
            element.setAttribute(key, '');
        }
        else {
            element.setAttribute(key, String(value));
        }
    }
    append(element, children);
    return element;
}
export function append(parent, children) {
    for (const child of children) {
        if (child === null || child === undefined || child === false)
            continue;
        parent.append(typeof child === 'number' ? String(child) : child);
    }
}
export function replaceChildren(parent, ...children) {
    parent.replaceChildren();
    append(parent, children);
}
export function debounce(fn, waitMs) {
    let timer;
    return (...args) => {
        if (timer !== undefined)
            clearTimeout(timer);
        timer = setTimeout(() => fn(...args), waitMs);
    };
}
export function field(label, control, hint) {
    return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'hint' }, hint) : null);
}
export function select(options, current, onChange) {
    const element = h('select', {});
    for (const option of options) {
        const node = h('option', { value: option.value }, option.label);
        node.selected = option.value === current;
        element.append(node);
    }
    element.addEventListener('change', () => onChange(element.value));
    return element;
}
export function checkbox(label, checked, onChange) {
    const input = h('input', { type: 'checkbox', checked });
    input.addEventListener('change', () => onChange(input.checked));
    return h('label', { class: 'check' }, input, h('span', {}, label));
}
