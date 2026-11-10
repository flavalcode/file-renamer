import { PresetError, errorMessage } from './errors.js';
import { hasForbiddenChars } from './validation.js';
import {
  FREE_NAME_TOKENS,
  TEMPLATE_TOKENS,
  assertValidTemplate,
  compileSafeRegExp,
  expandTemplate,
} from './rules/index.js';
import { MAX_FIXED_DIGITS, MAX_SEQUENCE_START, MAX_SEQUENCE_STEP } from './sequence.js';
import type {
  DateSource,
  Filters,
  OrderBy,
  Preset,
  Rule,
  SequenceOptions,
  SequenceScope,
} from './types.js';

/**
 * Strict validation of preset JSON. Hand-written (zero dependencies):
 * - unknown keys are rejected (typos are errors; `__proto__` cannot sneak in),
 * - the result is a NEW object built from known keys only,
 * - every problem is collected, so the user sees all of them at once.
 */

export const MAX_PRESET_BYTES = 256 * 1024;
export const MAX_RULES = 50;
const MAX_TEXT = 255;
const MAX_DELIMITER = 10;
const MAX_LIST_ITEMS = 50;

export const DEFAULT_MAX_FILES = 10_000;
const HARD_MAX_FILES = 100_000;

export const DEFAULT_FILTERS: Filters = {
  extensions: [],
  include: [],
  exclude: [],
  recursive: false,
  includeHidden: false,
  maxFiles: DEFAULT_MAX_FILES,
};

export const DEFAULT_SEQUENCE: SequenceOptions = {
  start: 1,
  step: 1,
  digits: 'auto',
  delimiter: '_',
  scope: 'global',
  orderBy: 'name',
  reverse: false,
};

type Raw = Record<string, unknown>;

class Collector {
  public readonly issues: string[] = [];
  add(path: string, message: string): void {
    this.issues.push(`${path}: ${message}`);
  }
}

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readObject(value: unknown, path: string, allowed: readonly string[], c: Collector): Raw | null {
  if (!isRecord(value)) {
    c.add(path, 'deve essere un oggetto');
    return null;
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      c.add(`${path}.${key}`, `proprietà sconosciuta (ammesse: ${allowed.join(', ')})`);
    }
  }
  return value;
}

interface TextOptions {
  readonly required?: boolean;
  readonly allowEmpty?: boolean;
  readonly max?: number;
}

function readText(obj: Raw, key: string, path: string, c: Collector, opts: TextOptions = {}): string | undefined {
  const value = obj[key];
  if (value === undefined) {
    if (opts.required) {
      c.add(`${path}.${key}`, 'campo obbligatorio');
    }
    return undefined;
  }
  if (typeof value !== 'string') {
    c.add(`${path}.${key}`, 'deve essere una stringa');
    return undefined;
  }
  if (!opts.allowEmpty && value.length === 0) {
    c.add(`${path}.${key}`, 'non può essere vuoto');
    return undefined;
  }
  if (value.length > (opts.max ?? MAX_TEXT)) {
    c.add(`${path}.${key}`, `troppo lungo (massimo ${opts.max ?? MAX_TEXT} caratteri)`);
    return undefined;
  }
  return value;
}

function readBool(obj: Raw, key: string, path: string, c: Collector): boolean | undefined {
  const value = obj[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    c.add(`${path}.${key}`, 'deve essere true o false');
    return undefined;
  }
  return value;
}

function readInt(obj: Raw, key: string, path: string, c: Collector, min: number, max: number): number | undefined {
  const value = obj[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    c.add(`${path}.${key}`, `deve essere un intero tra ${min} e ${max}`);
    return undefined;
  }
  return value;
}

function readEnum<T extends string>(
  obj: Raw,
  key: string,
  path: string,
  c: Collector,
  values: readonly T[],
  required = false,
): T | undefined {
  const value = obj[key];
  if (value === undefined) {
    if (required) {
      c.add(`${path}.${key}`, 'campo obbligatorio');
    }
    return undefined;
  }
  if (typeof value !== 'string' || !values.includes(value as T)) {
    c.add(`${path}.${key}`, `valore non valido (ammessi: ${values.join(', ')})`);
    return undefined;
  }
  return value as T;
}

function readStringList(obj: Raw, key: string, path: string, c: Collector): string[] {
  const value = obj[key];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || value.length > MAX_LIST_ITEMS) {
    c.add(`${path}.${key}`, `deve essere un elenco di al massimo ${MAX_LIST_ITEMS} stringhe`);
    return [];
  }
  const result: string[] = [];
  value.forEach((item: unknown, index) => {
    if (typeof item !== 'string' || item.length === 0 || item.length > MAX_TEXT) {
      c.add(`${path}.${key}[${index}]`, 'deve essere una stringa non vuota');
    } else {
      result.push(item);
    }
  });
  return result;
}

/** Runs a check that may throw and records the message instead. */
function guard(path: string, c: Collector, check: () => void): void {
  try {
    check();
  } catch (error) {
    c.add(path, errorMessage(error));
  }
}

// --- Rules -----------------------------------------------------------------

const RULE_TYPES = [
  'replace',
  'affix',
  'case',
  'separators',
  'removeChars',
  'accents',
  'cut',
  'insert',
  'date',
  'template',
] as const;

function parseRule(value: unknown, path: string, c: Collector): Rule | null {
  if (!isRecord(value)) {
    c.add(path, 'deve essere un oggetto');
    return null;
  }
  const type = readEnum(value, 'type', path, c, RULE_TYPES, true);
  if (!type) {
    return null;
  }
  const keys = (...names: string[]): Raw | null => readObject(value, path, ['type', ...names], c);

  switch (type) {
    case 'replace': {
      if (!keys('find', 'with', 'regex', 'caseSensitive', 'all')) return null;
      const find = readText(value, 'find', path, c, { required: true });
      const replacement = readText(value, 'with', path, c, { required: true, allowEmpty: true });
      const regex = readBool(value, 'regex', path, c);
      if (find !== undefined && regex === true) {
        guard(`${path}.find`, c, () => compileSafeRegExp(find, ''));
      }
      return find === undefined || replacement === undefined
        ? null
        : {
            type,
            find,
            with: replacement,
            regex,
            caseSensitive: readBool(value, 'caseSensitive', path, c),
            all: readBool(value, 'all', path, c),
          };
    }
    case 'affix': {
      keys('prefix', 'suffix');
      const prefix = readText(value, 'prefix', path, c);
      const suffix = readText(value, 'suffix', path, c);
      if (prefix === undefined && suffix === undefined) {
        c.add(path, 'indicare almeno "prefix" o "suffix"');
        return null;
      }
      return { type, prefix, suffix };
    }
    case 'case': {
      keys('mode');
      const mode = readEnum(value, 'mode', path, c, ['lower', 'upper', 'title', 'sentence'] as const, true);
      return mode ? { type, mode } : null;
    }
    case 'separators':
      keys('spaces', 'collapse', 'trim');
      return {
        type,
        spaces: readEnum(value, 'spaces', path, c, ['keep', 'underscore', 'dash', 'dot', 'remove'] as const),
        collapse: readBool(value, 'collapse', path, c),
        trim: readBool(value, 'trim', path, c),
      };
    case 'removeChars':
      keys('digits', 'punctuation', 'emoji', 'brackets', 'custom');
      return {
        type,
        digits: readBool(value, 'digits', path, c),
        punctuation: readBool(value, 'punctuation', path, c),
        emoji: readBool(value, 'emoji', path, c),
        brackets: readBool(value, 'brackets', path, c),
        custom: readText(value, 'custom', path, c),
      };
    case 'accents':
      keys();
      return { type };
    case 'cut':
      keys('fromStart', 'fromEnd');
      return {
        type,
        fromStart: readInt(value, 'fromStart', path, c, 0, MAX_TEXT),
        fromEnd: readInt(value, 'fromEnd', path, c, 0, MAX_TEXT),
      };
    case 'insert': {
      keys('text', 'position', 'index', 'anchor');
      const text = readText(value, 'text', path, c, { required: true });
      const position = readEnum(value, 'position', path, c, ['start', 'end', 'index', 'before', 'after'] as const, true);
      const index = readInt(value, 'index', path, c, 0, MAX_TEXT);
      const anchor = readText(value, 'anchor', path, c);
      if (position === 'index' && index === undefined) {
        c.add(`${path}.index`, 'obbligatorio con position "index"');
      }
      if ((position === 'before' || position === 'after') && anchor === undefined) {
        c.add(`${path}.anchor`, 'obbligatorio con position "before" / "after"');
      }
      return text === undefined || position === undefined ? null : { type, text, position, index, anchor };
    }
    case 'date': {
      keys('source', 'format', 'position', 'separator');
      const source = readEnum<DateSource>(value, 'source', path, c, ['modified', 'created', 'exif', 'today'], true);
      return source
        ? {
            type,
            source,
            format: readText(value, 'format', path, c, { max: 40 }),
            position: readEnum(value, 'position', path, c, ['prefix', 'suffix'] as const),
            separator: readText(value, 'separator', path, c, { allowEmpty: true, max: MAX_DELIMITER }),
          }
        : null;
    }
    case 'template': {
      keys('template');
      const template = readText(value, 'template', path, c, { required: true });
      if (template !== undefined) {
        guard(`${path}.template`, c, () => assertValidTemplate(template, TEMPLATE_TOKENS));
      }
      return template === undefined ? null : { type, template };
    }
  }
}

// --- Sequence / free mode --------------------------------------------------

const SEQUENCE_KEYS = ['start', 'step', 'digits', 'delimiter', 'scope', 'orderBy', 'reverse'] as const;

function parseSequenceFields(obj: Raw, path: string, c: Collector): SequenceOptions {
  let digits: SequenceOptions['digits'] = DEFAULT_SEQUENCE.digits;
  const rawDigits = obj['digits'];
  if (rawDigits !== undefined && rawDigits !== 'auto') {
    if (typeof rawDigits === 'number' && Number.isInteger(rawDigits) && rawDigits >= 1 && rawDigits <= MAX_FIXED_DIGITS) {
      digits = rawDigits;
    } else {
      c.add(`${path}.digits`, `deve essere "auto" oppure un intero tra 1 e ${MAX_FIXED_DIGITS}`);
    }
  }

  const delimiter = readText(obj, 'delimiter', path, c, { allowEmpty: true, max: MAX_DELIMITER });
  if (delimiter !== undefined && hasForbiddenChars(delimiter)) {
    c.add(`${path}.delimiter`, 'contiene caratteri non ammessi nei nomi di file');
  }

  return {
    start: readInt(obj, 'start', path, c, 0, MAX_SEQUENCE_START) ?? DEFAULT_SEQUENCE.start,
    step: readInt(obj, 'step', path, c, 1, MAX_SEQUENCE_STEP) ?? DEFAULT_SEQUENCE.step,
    digits,
    delimiter: delimiter ?? DEFAULT_SEQUENCE.delimiter,
    scope:
      readEnum<SequenceScope>(obj, 'scope', path, c, ['global', 'perFolder', 'perExtension']) ??
      DEFAULT_SEQUENCE.scope,
    orderBy:
      readEnum<OrderBy>(obj, 'orderBy', path, c, ['name', 'modified', 'created', 'exif', 'size', 'manual']) ??
      DEFAULT_SEQUENCE.orderBy,
    reverse: readBool(obj, 'reverse', path, c) ?? DEFAULT_SEQUENCE.reverse,
  };
}

// --- Filters ---------------------------------------------------------------

function parseFilters(value: unknown, path: string, c: Collector): Filters {
  if (value === undefined) {
    return DEFAULT_FILTERS;
  }
  const obj = readObject(
    value,
    path,
    ['extensions', 'include', 'exclude', 'nameRegex', 'recursive', 'includeHidden', 'maxFiles'],
    c,
  );
  if (!obj) {
    return DEFAULT_FILTERS;
  }
  const extensions = readStringList(obj, 'extensions', path, c).map((ext) => ext.replace(/^\./u, '').toLowerCase());
  extensions.forEach((ext, index) => {
    if (!/^[a-z0-9_-]+(\.[a-z0-9_-]+)?$/u.test(ext) || ext.length > 16) {
      c.add(`${path}.extensions[${index}]`, `estensione non valida: "${ext}"`);
    }
  });

  const nameRegex = readText(obj, 'nameRegex', path, c);
  if (nameRegex !== undefined) {
    guard(`${path}.nameRegex`, c, () => compileSafeRegExp(nameRegex, 'i'));
  }

  return {
    extensions,
    include: readStringList(obj, 'include', path, c),
    exclude: readStringList(obj, 'exclude', path, c),
    nameRegex,
    recursive: readBool(obj, 'recursive', path, c) ?? DEFAULT_FILTERS.recursive,
    includeHidden: readBool(obj, 'includeHidden', path, c) ?? DEFAULT_FILTERS.includeHidden,
    maxFiles: readInt(obj, 'maxFiles', path, c, 1, HARD_MAX_FILES) ?? DEFAULT_FILTERS.maxFiles,
  };
}

// --- Entry point -----------------------------------------------------------

/** Validates an untrusted value and returns a well-typed `Preset`. Throws `PresetError`. */
export function parsePreset(input: unknown): Preset {
  const c = new Collector();
  const root = readObject(input, '$', ['version', 'mode', 'rules', 'sequence', 'free', 'filters'], c);
  if (!root) {
    throw new PresetError(c.issues);
  }

  if (root['version'] !== undefined && root['version'] !== 1) {
    c.add('$.version', 'versione non supportata (atteso 1)');
  }
  const mode = readEnum(root, 'mode', '$', c, ['rules', 'free'] as const, true);
  const filters = parseFilters(root['filters'], '$.filters', c);

  let preset: Preset | null = null;

  if (mode === 'rules') {
    if (root['free'] !== undefined) {
      c.add('$.free', 'non ammesso con mode "rules"');
    }
    const rawRules = root['rules'];
    const rules: Rule[] = [];
    if (!Array.isArray(rawRules) || rawRules.length === 0 || rawRules.length > MAX_RULES) {
      c.add('$.rules', `deve essere un elenco di 1-${MAX_RULES} regole`);
    } else {
      rawRules.forEach((raw: unknown, index) => {
        const rule = parseRule(raw, `$.rules[${index}]`, c);
        if (rule) {
          rules.push(rule);
        }
      });
    }
    let sequence: SequenceOptions | null = null;
    if (root['sequence'] !== undefined && root['sequence'] !== null) {
      const obj = readObject(root['sequence'], '$.sequence', SEQUENCE_KEYS, c);
      sequence = obj ? parseSequenceFields(obj, '$.sequence', c) : null;
    }
    preset = { version: 1, mode, rules, sequence, filters };
  } else if (mode === 'free') {
    for (const forbidden of ['rules', 'sequence'] as const) {
      if (root[forbidden] !== undefined) {
        c.add(`$.${forbidden}`, 'non ammesso con mode "free"');
      }
    }
    const obj = readObject(root['free'], '$.free', ['name', ...SEQUENCE_KEYS], c);
    if (obj) {
      const name = readText(obj, 'name', '$.free', c, { required: true });
      if (name !== undefined) {
        guard('$.free.name', c, () => {
          const sample = expandTemplate(name, FREE_NAME_TOKENS, () => 'x');
          if (hasForbiddenChars(sample)) {
            throw new Error('il nome contiene caratteri non ammessi nei nomi di file');
          }
        });
      }
      const sequence = parseSequenceFields(obj, '$.free', c);
      preset = { version: 1, mode, free: { name: name ?? '', ...sequence }, filters };
    }
  }

  if (c.issues.length > 0 || preset === null) {
    throw new PresetError(c.issues.length > 0 ? c.issues : ['preset non valido']);
  }
  return preset;
}

/** Parses preset JSON text (size-limited). */
export function parsePresetJson(text: string): Preset {
  if (Buffer.byteLength(text, 'utf8') > MAX_PRESET_BYTES) {
    throw new PresetError([`il file supera ${MAX_PRESET_BYTES / 1024} KB`]);
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new PresetError([`JSON non valido: ${errorMessage(error)}`]);
  }
  return parsePreset(data);
}

/** True when the preset needs EXIF dates (so the scanner must read them). */
export function presetRequiresExif(preset: Preset): boolean {
  if (preset.mode === 'free') {
    return preset.free.orderBy === 'exif';
  }
  return (
    preset.sequence?.orderBy === 'exif' ||
    preset.rules.some((rule) => rule.type === 'date' && rule.source === 'exif')
  );
}
