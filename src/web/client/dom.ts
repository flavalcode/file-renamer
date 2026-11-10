/**
 * Tiny DOM helper. It never parses markup: every string becomes a text node,
 * so file names (untrusted) cannot inject markup or scripts.
 */

export type Child = Node | string | number | null | undefined | false;
export type Props = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      element.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key === 'value') {
      (element as unknown as HTMLInputElement).value = String(value);
    } else if (key === 'checked') {
      (element as unknown as HTMLInputElement).checked = value === true;
    } else if (key === 'disabled') {
      (element as unknown as HTMLButtonElement).disabled = value === true;
    } else if (value === true) {
      element.setAttribute(key, '');
    } else {
      element.setAttribute(key, String(value));
    }
  }
  append(element, children);
  return element;
}

export function append(parent: Element, children: readonly Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(typeof child === 'number' ? String(child) : child);
  }
}

export function replaceChildren(parent: Element, ...children: Child[]): void {
  parent.replaceChildren();
  append(parent, children);
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, waitMs: number): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), waitMs);
  };
}

/** `<label>` wrapping a control (keeps labels accessible and clickable). */
export function field(label: string, control: Node, hint?: string): HTMLLabelElement {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'hint' }, hint) : null);
}

export function select(
  options: ReadonlyArray<{ value: string; label: string }>,
  current: string,
  onChange: (value: string) => void,
): HTMLSelectElement {
  const element = h('select', {});
  for (const option of options) {
    const node = h('option', { value: option.value }, option.label);
    node.selected = option.value === current;
    element.append(node);
  }
  element.addEventListener('change', () => onChange(element.value));
  return element;
}

export function checkbox(label: string, checked: boolean, onChange: (value: boolean) => void): HTMLLabelElement {
  const input = h('input', { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'check' }, input, h('span', {}, label));
}
