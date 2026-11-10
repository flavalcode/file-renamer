import { loadScan, messageOf, selectedCount } from './actions.js';
import { checkbox, debounce, h, replaceChildren } from './dom.js';
import { createFolderBrowser } from './folder-browser.js';
import { displayPath, formatDateTime, formatSize, plural } from './format.js';
import type { Context } from './state.js';

const MAX_ROWS = 1000;

function undoBanner(ctx: Context): HTMLElement | null {
  const last = ctx.state.info?.lastUndo;
  if (!last) return null;
  const status = h('span', { class: 'muted', role: 'status' });
  const button = h('button', { type: 'button', class: 'btn btn-small' }, 'Annulla quella rinomina');
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.textContent = 'Ripristino in corso…';
    try {
      const result = await ctx.api.undo(last.runId);
      if (result.status !== 'applied') {
        status.textContent = `Non è stato possibile annullare: ${result.failure ?? 'errore'}`;
        button.disabled = false;
        return;
      }
      ctx.state.notice = `Rinomina annullata: ripristinati ${plural(result.renamed, 'file', 'file')}.`;
      if (ctx.state.scan) {
        await loadScan(ctx, true).catch(() => {
          ctx.state.scan = null;
        });
      }
      await ctx.refreshInfo();
    } catch (error) {
      status.textContent = messageOf(error);
      button.disabled = false;
    }
  });
  return h(
    'div',
    { class: 'banner banner-info' },
    h('span', {}, `Ultima rinomina: ${plural(last.count, 'file', 'file')}, ${formatDateTime(last.createdAt)}. `),
    button,
    status,
  );
}

export function renderStepFiles(root: HTMLElement, ctx: Context): void {
  const { state, api } = ctx;

  const heading = h('h2', { tabindex: '-1', id: 'step-heading' }, '1. Scegli i file');
  const status = h('div', { class: 'status', role: 'status' });
  const error = h('div', { class: 'banner banner-error', role: 'alert', hidden: true });
  const listHost = h('div', {});
  const browserHost = h('div', {});
  const nextButton = h('button', { type: 'button', class: 'btn btn-primary', disabled: true }, 'Avanti: scegli la rinomina →');

  const pathInput = h('input', {
    type: 'text',
    class: 'path-input',
    value: state.path,
    placeholder: 'Incolla qui il percorso della cartella, oppure usa «Sfoglia»',
    'aria-label': 'Cartella con i file da rinominare',
    spellcheck: 'false',
    autocomplete: 'off',
  });

  function showError(text: string | null): void {
    error.hidden = text === null;
    error.textContent = text ?? '';
  }

  function updateNext(): void {
    const count = selectedCount(ctx);
    nextButton.disabled = count === 0;
    nextButton.textContent = count === 0 ? 'Avanti: scegli la rinomina →' : `Avanti con ${plural(count, 'file', 'file')} →`;
  }

  async function load(keepSelection = false): Promise<void> {
    state.path = pathInput.value;
    if (state.path.trim() === '') {
      showError('Indica una cartella.');
      return;
    }
    showError(null);
    status.textContent = 'Carico i file…';
    try {
      await loadScan(ctx, keepSelection);
      pathInput.value = state.path;
      status.textContent = '';
    } catch (e) {
      state.scan = null;
      status.textContent = '';
      showError(messageOf(e));
    }
    renderList();
  }

  function renderList(): void {
    const scan = state.scan;
    if (!scan) {
      replaceChildren(listHost, h('p', { class: 'muted empty' }, 'Scegli una cartella per vedere i file.'));
      updateNext();
      return;
    }
    const summary = h('strong', {});
    const refreshSummary = (): void => {
      summary.textContent = `${selectedCount(ctx)} di ${plural(scan.files.length, 'file', 'file')} selezionati`;
      updateNext();
    };

    const rows = scan.files.slice(0, MAX_ROWS);
    const checks: HTMLInputElement[] = [];
    const body = h('tbody', {});
    for (const file of rows) {
      const input = h('input', { type: 'checkbox', checked: !state.excluded.has(file.id), 'aria-label': `Includi ${file.name}` });
      input.addEventListener('change', () => {
        if (input.checked) state.excluded.delete(file.id);
        else state.excluded.add(file.id);
        allBox.checked = state.excluded.size === 0;
        refreshSummary();
      });
      checks.push(input);
      body.append(
        h(
          'tr',
          {},
          h('td', { class: 'cell-check' }, input),
          h('td', { class: 'cell-old', title: displayPath(file.dir, file.name) }, displayPath(file.dir, file.name)),
          h('td', { class: 'cell-num' }, formatSize(file.size)),
          h('td', { class: 'cell-num' }, formatDateTime(file.mtimeMs)),
        ),
      );
    }

    const allBox = h('input', { type: 'checkbox', checked: state.excluded.size === 0, 'aria-label': 'Seleziona o deseleziona tutti' });
    allBox.addEventListener('change', () => {
      state.excluded = allBox.checked ? new Set<string>() : new Set(scan.files.map((file) => file.id));
      checks.forEach((box) => {
        box.checked = allBox.checked;
      });
      refreshSummary();
    });

    const skipped = scan.skipped;
    const skippedText = [
      skipped.hidden > 0 ? `${plural(skipped.hidden, 'file nascosto ignorato', 'file nascosti ignorati')}` : '',
      skipped.symlinks > 0 ? `${plural(skipped.symlinks, 'collegamento simbolico ignorato', 'collegamenti simbolici ignorati')}` : '',
      skipped.filtered > 0 ? `${skipped.filtered} esclusi dal filtro` : '',
    ].filter((text) => text !== '');

    replaceChildren(
      listHost,
      h('div', { class: 'list-head' }, summary, h('span', { class: 'muted' }, skippedText.join(' · '))),
      scan.files.length === 0
        ? h('p', { class: 'muted empty' }, 'Nessun file trovato con questi filtri.')
        : h(
            'div',
            { class: 'table-wrap tall' },
            h(
              'table',
              { class: 'files' },
              h('thead', {}, h('tr', {}, h('th', { class: 'cell-check' }, allBox), h('th', {}, 'Nome'), h('th', {}, 'Dimensione'), h('th', {}, 'Modificato'))),
              body,
            ),
          ),
      scan.files.length > rows.length
        ? h('p', { class: 'muted note' }, `Mostrati i primi ${rows.length}: «seleziona tutti» e le opzioni valgono per tutti i ${scan.files.length} file.`)
        : null,
    );
    refreshSummary();
  }

  function toggleBrowser(): void {
    if (browserHost.childElementCount > 0) {
      replaceChildren(browserHost);
      return;
    }
    replaceChildren(
      browserHost,
      createFolderBrowser({
        api,
        shortcuts: state.info?.shortcuts ?? [],
        startPath: pathInput.value.trim() || state.info?.home || '',
        showHidden: state.options.includeHidden,
        onChoose: (chosen) => {
          pathInput.value = chosen;
          replaceChildren(browserHost);
          void load();
        },
        onClose: () => replaceChildren(browserHost),
      }),
    );
  }

  const reload = (): void => {
    if (state.scan !== null || pathInput.value.trim() !== '') void load(true);
  };
  const reloadSoon = debounce(reload, 500);

  const extInput = h('input', { type: 'text', value: state.options.extensions, placeholder: 'es. jpg, png', 'aria-label': 'Solo queste estensioni', spellcheck: 'false' });
  extInput.addEventListener('input', () => {
    state.options.extensions = extInput.value;
    reloadSoon();
  });

  pathInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void load();
  });
  nextButton.addEventListener('click', () => ctx.go(2));

  const notice = state.notice;
  state.notice = null;
  const banner = notice ? h('div', { class: 'banner banner-success', role: 'status' }, notice) : undoBanner(ctx);

  replaceChildren(
    root,
    heading,
    h('p', { class: 'lead' }, 'Scegli la cartella: i file vengono rinominati sul tuo computer, senza essere caricati su Internet.'),
    banner,
    h(
      'div',
      { class: 'card' },
      h(
        'div',
        { class: 'path-row' },
        pathInput,
        h('button', { type: 'button', class: 'btn', onClick: toggleBrowser }, 'Sfoglia…'),
        h('button', { type: 'button', class: 'btn btn-primary', onClick: () => void load() }, 'Carica file'),
      ),
      browserHost,
      h(
        'div',
        { class: 'options' },
        checkbox('Includi le sottocartelle', state.options.recursive, (value) => {
          state.options.recursive = value;
          reload();
        }),
        checkbox('Mostra i file nascosti', state.options.includeHidden, (value) => {
          state.options.includeHidden = value;
          reload();
        }),
        h('label', { class: 'inline-field' }, h('span', {}, 'Solo estensioni:'), extInput),
      ),
      status,
      error,
    ),
    h('div', { class: 'card' }, listHost),
    h('div', { class: 'footer' }, h('span', {}), nextButton),
  );

  renderList();
  if (state.scan === null && state.path.trim() !== '') void load();
}
