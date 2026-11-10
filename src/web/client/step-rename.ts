import { ApiError } from './api.js';
import { messageOf } from './actions.js';
import { checkbox, debounce, field, h, replaceChildren } from './dom.js';
import { plural } from './format.js';
import { renderNumberingForm } from './numbering-form.js';
import { buildPresetInput, describeIssue } from './preset-builder.js';
import { renderPreviewTable } from './preview-table.js';
import { renderRuleEditor } from './rule-editor.js';
import type { Context } from './state.js';

const PREVIEW_ROWS = 300;

export function renderStepRename(root: HTMLElement, ctx: Context): void {
  const { state, api } = ctx;
  const form = state.form;
  const scan = state.scan;
  if (!scan) {
    ctx.go(1);
    return;
  }

  const lead = h('p', { class: 'lead' });
  const updateLead = (): void => {
    lead.textContent = `${plural(scan.files.length - state.excluded.size, 'file selezionato', 'file selezionati')} in ${scan.root}. L'estensione dei file non viene mai modificata.`;
  };
  const exclude = (id: string): void => {
    state.excluded.add(id);
    updateLead();
    void refreshPreview();
  };
  const configHost = h('div', {});
  const previewHost = h('div', {});
  const previewStatus = h('div', { class: 'status', role: 'status' });
  const nextButton = h('button', { type: 'button', class: 'btn btn-primary', disabled: true }, 'Avanti: rivedi e conferma →');
  let requestId = 0;

  function setNext(enabled: boolean, count = 0): void {
    nextButton.disabled = !enabled;
    nextButton.textContent = enabled ? `Avanti: rivedi ${plural(count, 'file', 'file')} →` : 'Avanti: rivedi e conferma →';
  }

  async function refreshPreview(): Promise<void> {
    requestId += 1;
    const mine = requestId;
    previewStatus.textContent = 'Aggiorno l\'anteprima…';
    try {
      const plan = await api.plan({ scanId: scan!.scanId, excluded: [...state.excluded], preset: buildPresetInput(form) });
      if (mine !== requestId) return;
      state.plan = plan;
      previewStatus.textContent = '';
      const { summary } = plan;
      const parts = [`${summary.toRename} da rinominare`];
      if (summary.unchanged > 0) parts.push(`${summary.unchanged} invariati`);
      if (summary.blocked > 0) parts.push(`${summary.blocked} bloccati`);
      if (summary.warnings > 0) parts.push(`${summary.warnings} avvisi`);
      replaceChildren(
        previewHost,
        h('p', { class: `summary ${plan.hasBlockingIssues ? 'summary-error' : ''}` }, parts.join(' · ')),
        plan.hasBlockingIssues
          ? h('div', { class: 'banner banner-error', role: 'alert' }, 'Alcuni file hanno un problema (vedi sotto): correggi le impostazioni oppure escludi quei file.')
          : null,
        renderPreviewTable(plan.items, { maxRows: PREVIEW_ROWS, onExclude: exclude }),
      );
      setNext(!plan.hasBlockingIssues && summary.toRename > 0, summary.toRename);
    } catch (error) {
      if (mine !== requestId) return;
      state.plan = null;
      setNext(false);
      previewStatus.textContent = '';
      if (error instanceof ApiError && error.code === 'PRESET_INVALID') {
        replaceChildren(
          previewHost,
          h(
            'div',
            { class: 'banner banner-warn', role: 'status' },
            h('strong', {}, 'Completa le impostazioni per vedere l\'anteprima:'),
            h('ul', {}, ...error.issues.map((issue) => h('li', {}, describeIssue(issue, form)))),
          ),
        );
      } else if (error instanceof ApiError && error.code === 'SCAN_EXPIRED') {
        replaceChildren(
          previewHost,
          h('div', { class: 'banner banner-error', role: 'alert' }, error.message, ' ', h('button', { type: 'button', class: 'btn btn-small', onClick: () => ctx.go(1) }, 'Torna ai file')),
        );
      } else {
        replaceChildren(previewHost, h('div', { class: 'banner banner-error', role: 'alert' }, messageOf(error)));
      }
    }
  }

  const refreshSoon = debounce(() => void refreshPreview(), 250);
  const onChange = (): void => {
    setNext(false);
    refreshSoon();
  };

  function renderConfig(): void {
    const modeButton = (mode: 'free' | 'rules', title: string, text: string): HTMLElement =>
      h(
        'button',
        {
          type: 'button',
          class: `mode ${form.mode === mode ? 'mode-active' : ''}`,
          'aria-pressed': String(form.mode === mode),
          onClick: () => {
            if (form.mode === mode) return;
            form.mode = mode;
            renderConfig();
            onChange();
          },
        },
        h('strong', {}, title),
        h('span', { class: 'muted small' }, text),
      );

    const modes = h(
      'div',
      { class: 'modes' },
      modeButton('free', 'Nome libero', 'Scegli un nome nuovo, poi la numerazione.'),
      modeButton('rules', 'Regole', 'Modifica i nomi esistenti con regole combinabili.'),
    );

    if (form.mode === 'free') {
      const nameInput = h('input', {
        type: 'text',
        value: form.freeName,
        placeholder: 'es. Vacanza_Roma',
        'aria-label': 'Nome dei file',
        maxlength: '200',
        autocomplete: 'off',
        spellcheck: 'false',
      });
      nameInput.addEventListener('input', () => {
        form.freeName = nameInput.value;
        onChange();
      });
      replaceChildren(
        configHost,
        modes,
        h(
          'div',
          { class: 'card' },
          field('Nome dei file', nameInput, 'Risultato: Nome + delimitatore + numero + estensione originale. Segnaposto: {parent} = nome della cartella, {date} = data di oggi.'),
          h('h3', {}, 'Numerazione'),
          renderNumberingForm(form.numbering, onChange),
        ),
      );
      return;
    }

    const numberingHost = h('div', {});
    const renderNumbering = (): void =>
      replaceChildren(numberingHost, form.rulesNumbering ? renderNumberingForm(form.numbering, onChange) : null);
    renderNumbering();

    replaceChildren(
      configHost,
      modes,
      h(
        'div',
        { class: 'card' },
        h('h3', {}, 'Regole'),
        renderRuleEditor(form.rules, onChange),
      ),
      h(
        'div',
        { class: 'card' },
        checkbox('Aggiungi una numerazione progressiva in fondo al nome', form.rulesNumbering, (value) => {
          form.rulesNumbering = value;
          renderNumbering();
          onChange();
        }),
        numberingHost,
      ),
    );
  }

  nextButton.addEventListener('click', () => {
    if (state.plan && !state.plan.hasBlockingIssues) ctx.go(3);
  });

  replaceChildren(
    root,
    h('h2', { tabindex: '-1', id: 'step-heading' }, '2. Come rinominare'),
    lead,
    configHost,
    h('div', { class: 'card' }, h('h3', {}, 'Anteprima'), previewStatus, previewHost),
    h('div', { class: 'footer' }, h('button', { type: 'button', class: 'btn', onClick: () => ctx.go(1) }, '← Indietro'), nextButton),
  );
  updateLead();
  renderConfig();
  void refreshPreview();
}
