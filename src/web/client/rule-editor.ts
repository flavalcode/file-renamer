import { checkbox, field, h, replaceChildren, select } from './dom.js';
import { newRule } from './preset-builder.js';
import type { RuleDraft } from './preset-builder.js';
import { RULE_SCHEMAS, schemaFor } from './rule-schemas.js';
import type { FieldSchema } from './rule-schemas.js';

/** Editable list of rule cards. `onChange` fires on every edit (to refresh the preview). */
export function renderRuleEditor(rules: RuleDraft[], onChange: () => void): HTMLElement {
  const host = h('div', { class: 'rules' });
  const addType = select(
    RULE_SCHEMAS.map((schema) => ({ value: schema.type, label: schema.label })),
    RULE_SCHEMAS[0]?.type ?? '',
    () => undefined,
  );

  function move(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= rules.length) return;
    const [item] = rules.splice(index, 1);
    if (item) rules.splice(target, 0, item);
    render();
    onChange();
  }

  function control(draft: RuleDraft, schema: FieldSchema, rerenderCard: () => void): HTMLElement {
    const dependents = RULE_SCHEMAS.find((s) => s.type === draft.type)?.fields.some((f) => f.showIf?.key === schema.key) ?? false;
    const current = draft.values[schema.key];
    const update = (value: string | boolean): void => {
      draft.values[schema.key] = value;
      if (dependents) rerenderCard();
      onChange();
    };
    if (schema.kind === 'bool') {
      return checkbox(schema.label, current === true, update);
    }
    if (schema.kind === 'select') {
      return field(schema.label, select(schema.options ?? [], String(current ?? ''), update));
    }
    const input = h('input', {
      type: 'text',
      value: String(current ?? ''),
      placeholder: schema.placeholder,
      inputmode: schema.kind === 'int' ? 'numeric' : undefined,
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': schema.label,
    });
    input.addEventListener('input', () => update(input.value));
    return field(schema.label, input, schema.hint);
  }

  function card(draft: RuleDraft, index: number): HTMLElement {
    const schema = schemaFor(draft.type);
    const fieldsHost = h('div', { class: 'rule-fields' });
    const renderFields = (): void => {
      replaceChildren(
        fieldsHost,
        ...(schema?.fields ?? [])
          .filter((f) => {
            if (!f.showIf) return true;
            const value = draft.values[f.showIf.key];
            return typeof value === 'string' && f.showIf.in.includes(value);
          })
          .map((f) => control(draft, f, renderFields)),
      );
    };
    renderFields();

    return h(
      'div',
      { class: 'rule-card' },
      h(
        'div',
        { class: 'rule-head' },
        h('strong', {}, `${index + 1}. ${schema?.label ?? draft.type}`),
        h(
          'span',
          { class: 'rule-tools' },
          h('button', { type: 'button', class: 'btn btn-small btn-ghost', 'aria-label': 'Sposta su', disabled: index === 0, onClick: () => move(index, -1) }, '↑'),
          h('button', { type: 'button', class: 'btn btn-small btn-ghost', 'aria-label': 'Sposta giù', disabled: index === rules.length - 1, onClick: () => move(index, 1) }, '↓'),
          h(
            'button',
            {
              type: 'button',
              class: 'btn btn-small btn-ghost',
              'aria-label': 'Elimina regola',
              onClick: () => {
                rules.splice(index, 1);
                render();
                onChange();
              },
            },
            '✕',
          ),
        ),
      ),
      h('p', { class: 'muted small' }, schema?.description ?? ''),
      fieldsHost,
    );
  }

  function render(): void {
    replaceChildren(
      host,
      rules.length === 0
        ? h('p', { class: 'muted empty' }, 'Nessuna regola: aggiungine una qui sotto. Le regole si applicano nell\'ordine mostrato.')
        : h('div', {}, ...rules.map((draft, index) => card(draft, index))),
      h(
        'div',
        { class: 'rule-add' },
        addType,
        h(
          'button',
          {
            type: 'button',
            class: 'btn',
            onClick: () => {
              rules.push(newRule(addType.value));
              render();
              onChange();
            },
          },
          '+ Aggiungi regola',
        ),
      ),
    );
  }

  render();
  return host;
}
