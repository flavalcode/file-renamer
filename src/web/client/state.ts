import type { Api } from './api.js';
import { defaultForm } from './preset-builder.js';
import type { RenameForm } from './preset-builder.js';
import type { ApplyResponse, InfoResponse, PlanResponse, ScanResponse, UndoResponse } from '../shared/api-types.js';

export type Step = 1 | 2 | 3;

export interface ScanOptions {
  recursive: boolean;
  includeHidden: boolean;
  /** Comma/space separated, as typed by the user. */
  extensions: string;
}

export type Outcome =
  | { kind: 'applied'; result: ApplyResponse }
  | { kind: 'failed'; result: ApplyResponse }
  | { kind: 'undone'; result: UndoResponse };

export interface AppState {
  step: Step;
  info: InfoResponse | null;
  path: string;
  options: ScanOptions;
  scan: ScanResponse | null;
  excluded: Set<string>;
  form: RenameForm;
  /** Last valid preview shown in step 2 (re-fetched when entering step 3). */
  plan: PlanResponse | null;
  outcome: Outcome | null;
  /** One-off message shown at the top of step 1 (e.g. after an undo). */
  notice: string | null;
}

export function initialState(): AppState {
  return {
    step: 1,
    info: null,
    path: '',
    options: { recursive: false, includeHidden: false, extensions: '' },
    scan: null,
    excluded: new Set<string>(),
    form: defaultForm(),
    plan: null,
    outcome: null,
    notice: null,
  };
}

/** What every step view receives from `main.ts`. */
export interface Context {
  readonly state: AppState;
  readonly api: Api;
  go(step: Step): void;
  /** Re-reads `/api/info` (e.g. after an undo) and re-renders the current step. */
  refreshInfo(): Promise<void>;
}

export function parseExtensions(text: string): string[] {
  return text
    .split(/[\s,;]+/u)
    .map((part) => part.trim().replace(/^\./u, ''))
    .filter((part) => part.length > 0);
}
