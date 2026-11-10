import { h } from './dom.js';
import { displayPath, plural } from './format.js';
import type { PlanItemDto } from '../shared/api-types.js';

const STATUS_LABEL: Record<PlanItemDto['status'], string> = {
  rename: 'Rinomina',
  unchanged: 'Invariato',
  blocked: 'Bloccato',
};

export interface PreviewOptions {
  readonly maxRows: number;
  /** Hide files that will not change (step 3 shows only what really happens). */
  readonly hideUnchanged?: boolean;
  /** When set, blocked rows get an "Escludi" button that removes the file from the batch. */
  readonly onExclude?: (id: string) => void;
}

/** Before → After table. Every value is inserted as text (no HTML). */
export function renderPreviewTable(items: readonly PlanItemDto[], options: PreviewOptions): HTMLElement {
  const visible = options.hideUnchanged === true ? items.filter((item) => item.status !== 'unchanged') : items;
  const shown = visible.slice(0, options.maxRows);

  const body = h('tbody', {});
  for (const item of shown) {
    const row = h('tr', { class: `row-${item.status}` });
    row.append(
      h('td', { class: 'cell-old', title: displayPath(item.dir, item.oldName) }, displayPath(item.dir, item.oldName)),
      h('td', { class: 'cell-arrow', 'aria-hidden': 'true' }, '→'),
      h(
        'td',
        { class: 'cell-new' },
        item.status === 'unchanged' ? h('span', { class: 'muted' }, 'invariato') : item.newName,
        ...item.issues.map((issue) => h('div', { class: `issue issue-${issue.severity}` }, issue.message)),
      ),
      h(
        'td',
        { class: 'cell-status' },
        h('span', { class: `badge badge-${item.status}` }, STATUS_LABEL[item.status]),
        item.status === 'blocked' && options.onExclude
          ? h(
              'button',
              { type: 'button', class: 'btn btn-small btn-exclude', title: 'Non rinominare questo file', onClick: () => options.onExclude?.(item.id) },
              'Escludi',
            )
          : null,
      ),
    );
    body.append(row);
  }

  const table = h(
    'table',
    { class: 'preview' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Prima'), h('th', {}), h('th', {}, 'Dopo'), h('th', {}, 'Esito'))),
    body,
  );
  const wrapper = h('div', { class: 'table-wrap' }, table);
  if (visible.length > shown.length) {
    wrapper.append(
      h('p', { class: 'muted note' }, `Mostrati i primi ${shown.length} su ${plural(visible.length, 'file', 'file')}: il resto è incluso nell'operazione.`),
    );
  }
  if (visible.length === 0) {
    wrapper.append(h('p', { class: 'muted note' }, 'Nessun file da mostrare.'));
  }
  return wrapper;
}
