import { parseArgs } from 'node:util';

export class UsageError extends Error {}

export interface FilterOverrides {
  recursive?: boolean;
  includeHidden?: boolean;
  extensions?: string[];
  include?: string[];
  exclude?: string[];
  nameRegex?: string;
  maxFiles?: number;
}

export interface CommonFlags {
  readonly json: boolean;
  readonly noColor: boolean;
  readonly yes: boolean;
  readonly stateDir: string | undefined;
}

export type ParsedCommand =
  | { readonly command: 'help' }
  | { readonly command: 'version' }
  | ({ readonly command: 'history' } & CommonFlags)
  | ({ readonly command: 'undo' } & CommonFlags)
  | ({ readonly command: 'ui'; readonly port: number; readonly noOpen: boolean } & CommonFlags)
  | ({ readonly command: 'validate'; readonly file: string } & CommonFlags)
  | ({
      readonly command: 'rename';
      readonly dir: string;
      /** Path of a preset file, or a raw (unvalidated) preset built from inline flags. */
      readonly source: { readonly presetFile: string } | { readonly raw: Record<string, unknown> };
      readonly filters: FilterOverrides;
      readonly apply: boolean;
      readonly showAll: boolean;
    } & CommonFlags);

const OPTIONS = {
  preset: { type: 'string' },
  name: { type: 'string' },
  delimiter: { type: 'string' },
  start: { type: 'string' },
  step: { type: 'string' },
  digits: { type: 'string' },
  scope: { type: 'string' },
  'order-by': { type: 'string' },
  reverse: { type: 'boolean' },
  seq: { type: 'boolean' },
  rule: { type: 'string', multiple: true },
  recursive: { type: 'boolean', short: 'r' },
  'include-hidden': { type: 'boolean' },
  ext: { type: 'string' },
  include: { type: 'string', multiple: true },
  exclude: { type: 'string', multiple: true },
  'name-regex': { type: 'string' },
  'max-files': { type: 'string' },
  apply: { type: 'boolean' },
  yes: { type: 'boolean', short: 'y' },
  all: { type: 'boolean' },
  json: { type: 'boolean' },
  'no-color': { type: 'boolean' },
  'state-dir': { type: 'string' },
  port: { type: 'string' },
  'no-open': { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
} as const;

const SEQUENCE_FLAGS = ['delimiter', 'start', 'step', 'digits', 'scope', 'order-by', 'reverse', 'seq'] as const;
const MODE_FLAGS = ['name', 'rule', ...SEQUENCE_FLAGS] as const;

type Values = ReturnType<typeof parse>['values'];

function parse(argv: readonly string[]) {
  try {
    return parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error));
  }
}

function toNumber(flag: string, text: string): number {
  const value = Number(text);
  if (text.trim() === '' || !Number.isFinite(value)) {
    throw new UsageError(`--${flag} richiede un numero (ricevuto "${text}")`);
  }
  return value;
}

function buildSequence(values: Values): Record<string, unknown> {
  const sequence: Record<string, unknown> = {};
  if (values.delimiter !== undefined) sequence['delimiter'] = values.delimiter;
  if (values.start !== undefined) sequence['start'] = toNumber('start', values.start);
  if (values.step !== undefined) sequence['step'] = toNumber('step', values.step);
  if (values.digits !== undefined) {
    sequence['digits'] = values.digits === 'auto' ? 'auto' : toNumber('digits', values.digits);
  }
  if (values.scope !== undefined) sequence['scope'] = values.scope;
  if (values['order-by'] !== undefined) sequence['orderBy'] = values['order-by'];
  if (values.reverse !== undefined) sequence['reverse'] = values.reverse;
  return sequence;
}

function buildFilters(values: Values): FilterOverrides {
  const filters: FilterOverrides = {};
  if (values.recursive !== undefined) filters.recursive = values.recursive;
  if (values['include-hidden'] !== undefined) filters.includeHidden = values['include-hidden'];
  if (values.ext !== undefined) {
    filters.extensions = values.ext.split(',').map((e) => e.trim()).filter((e) => e.length > 0);
  }
  if (values.include !== undefined) filters.include = values.include;
  if (values.exclude !== undefined) filters.exclude = values.exclude;
  if (values['name-regex'] !== undefined) filters.nameRegex = values['name-regex'];
  if (values['max-files'] !== undefined) filters.maxFiles = toNumber('max-files', values['max-files']);
  return filters;
}

function buildInlinePreset(values: Values, filters: FilterOverrides): Record<string, unknown> {
  const hasSequenceFlag = SEQUENCE_FLAGS.some((flag) => values[flag] !== undefined);
  const sequence = buildSequence(values);

  if (values.name !== undefined) {
    if (values.rule !== undefined) {
      throw new UsageError('--name (Nome libero) e --rule (regole) sono modalità alternative.');
    }
    return { version: 1, mode: 'free', free: { name: values.name, ...sequence }, filters };
  }

  if (values.rule === undefined) {
    throw new UsageError('Indica --preset, --name (Nome libero) oppure almeno una --rule.');
  }
  const rules = values.rule.map((text, index) => {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new UsageError(`--rule #${index + 1} non è JSON valido: ${text}`);
    }
  });
  return {
    version: 1,
    mode: 'rules',
    rules,
    sequence: hasSequenceFlag ? sequence : null,
    filters,
  };
}

/** Parses the command line (pure: no I/O) into a typed command. Throws `UsageError`. */
export function parseCommandLine(argv: readonly string[]): ParsedCommand {
  const { values, positionals } = parse(argv);

  if (values.help === true) return { command: 'help' };
  if (values.version === true) return { command: 'version' };

  const common: CommonFlags = {
    json: values.json === true,
    noColor: values['no-color'] === true,
    yes: values.yes === true,
    stateDir: values['state-dir'],
  };

  const [first, ...rest] = positionals;
  if (first === undefined) {
    return { command: 'help' };
  }

  if (first === 'undo' || first === 'history') {
    if (rest.length > 0) throw new UsageError(`Argomenti inattesi: ${rest.join(' ')}`);
    return { command: first, ...common };
  }

  if (first === 'ui') {
    if (rest.length > 0) throw new UsageError(`Argomenti inattesi: ${rest.join(' ')}`);
    const port = values.port === undefined ? 0 : toNumber('port', values.port);
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
      throw new UsageError('--port richiede un numero intero tra 0 e 65535');
    }
    return { command: 'ui', port, noOpen: values['no-open'] === true, ...common };
  }

  if (first === 'validate') {
    const [file, ...extra] = rest;
    if (file === undefined || extra.length > 0) {
      throw new UsageError('Uso: renamer validate <preset.json>');
    }
    return { command: 'validate', file, ...common };
  }

  if (rest.length > 0) {
    throw new UsageError(`Indica una sola cartella (ricevuti: ${positionals.join(', ')})`);
  }

  const filters = buildFilters(values);
  const usesInlineMode = MODE_FLAGS.some((flag) => values[flag] !== undefined);

  if (values.preset !== undefined) {
    if (usesInlineMode) {
      throw new UsageError('--preset non è combinabile con --name, --rule o le opzioni di numerazione.');
    }
    return {
      command: 'rename',
      dir: first,
      source: { presetFile: values.preset },
      filters,
      apply: values.apply === true,
      showAll: values.all === true,
      ...common,
    };
  }

  return {
    command: 'rename',
    dir: first,
    source: { raw: buildInlinePreset(values, filters) },
    filters,
    apply: values.apply === true,
    showAll: values.all === true,
    ...common,
  };
}
