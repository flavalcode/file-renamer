import { messageOf } from './actions.js';
import type { Api } from './api.js';
import { h, replaceChildren } from './dom.js';
import type { Shortcut } from '../shared/api-types.js';

export interface FolderBrowserOptions {
  readonly api: Api;
  readonly shortcuts: readonly Shortcut[];
  readonly startPath: string;
  readonly showHidden: boolean;
  /** Called when the user confirms the folder currently shown. */
  onChoose(path: string): void;
  onClose(): void;
}

/** In-page folder picker: browsers cannot reveal real paths, so the local server lists them. */
export function createFolderBrowser(options: FolderBrowserOptions): HTMLElement {
  const { api } = options;
  const currentLabel = h('div', { class: 'browser-current', 'aria-live': 'polite' });
  const list = h('div', { class: 'browser-list', role: 'list' });
  const message = h('p', { class: 'muted note', role: 'status' });
  const upButton = h('button', { type: 'button', class: 'btn btn-small' }, '↑ Cartella superiore');
  const chooseButton = h('button', { type: 'button', class: 'btn btn-primary btn-small' }, 'Usa questa cartella');
  let current: string | null = null;

  async function open(target: string | null): Promise<void> {
    message.textContent = 'Caricamento…';
    try {
      const listing = await api.folders(target, options.showHidden);
      current = listing.path;
      currentLabel.textContent = listing.path;
      upButton.disabled = listing.parent === null;
      upButton.onclick = () => void open(listing.parent);
      chooseButton.disabled = false;
      replaceChildren(
        list,
        ...listing.folders.map((name) =>
          h(
            'button',
            {
              type: 'button',
              class: 'folder-item',
              role: 'listitem',
              onClick: () => void open(joinPath(listing.path, name)),
            },
            name,
          ),
        ),
      );
      message.textContent =
        listing.folders.length === 0 ? 'Nessuna sottocartella: puoi usare questa cartella.' : listing.truncated ? 'Elenco troncato: incolla il percorso se non trovi la cartella.' : '';
    } catch (error) {
      message.textContent = messageOf(error);
    }
  }

  chooseButton.addEventListener('click', () => {
    if (current !== null) options.onChoose(current);
  });

  const shortcutRow = h(
    'div',
    { class: 'chips' },
    ...options.shortcuts.map((shortcut) =>
      h('button', { type: 'button', class: 'chip', onClick: () => void open(shortcut.path) }, shortcut.label),
    ),
  );

  const panel = h(
    'div',
    { class: 'browser card' },
    h('div', { class: 'browser-head' }, h('strong', {}, 'Scegli la cartella'), h('button', { type: 'button', class: 'btn btn-small btn-ghost', onClick: options.onClose }, 'Chiudi')),
    shortcutRow,
    h('div', { class: 'browser-bar' }, upButton, currentLabel, chooseButton),
    list,
    message,
  );
  void open(options.startPath === '' ? null : options.startPath);
  return panel;
}

/** Joins using the separator already present in the path (works for `/` and `\`). */
export function joinPath(base: string, name: string): string {
  const separator = base.includes('\\') && !base.includes('/') ? '\\' : '/';
  return base.endsWith(separator) ? `${base}${name}` : `${base}${separator}${name}`;
}
