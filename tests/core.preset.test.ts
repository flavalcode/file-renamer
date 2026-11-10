import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { PresetError } from '../src/core/errors.js';
import {
  MAX_PRESET_BYTES,
  MAX_RULES,
  parsePreset,
  parsePresetJson,
  presetRequiresExif,
} from '../src/core/preset.js';

const issuesOf = (input: unknown): readonly string[] => {
  try {
    parsePreset(input);
  } catch (error) {
    assert.ok(error instanceof PresetError);
    return error.issues;
  }
  assert.fail('expected a PresetError');
};
const free = (extra: Record<string, unknown> = {}) => ({ mode: 'free', free: { name: 'N', ...extra } });

describe('parsePreset: valid input', () => {
  it('applies defaults to a minimal free preset', () => {
    const preset = parsePreset(free());
    assert.equal(preset.mode, 'free');
    if (preset.mode === 'free') {
      assert.deepEqual(preset.free, {
        name: 'N',
        start: 1,
        step: 1,
        digits: 'auto',
        delimiter: '_',
        scope: 'global',
        orderBy: 'name',
        reverse: false,
      });
    }
    assert.equal(preset.filters.recursive, false);
    assert.equal(preset.filters.includeHidden, false);
  });

  it('accepts every rule type', () => {
    const preset = parsePreset({
      mode: 'rules',
      rules: [
        { type: 'replace', find: 'a', with: 'b', regex: false, caseSensitive: false, all: true },
        { type: 'affix', prefix: 'p' },
        { type: 'case', mode: 'title' },
        { type: 'separators', spaces: 'dash', collapse: true, trim: true },
        { type: 'removeChars', digits: true, punctuation: true, emoji: true, brackets: true, custom: '#' },
        { type: 'accents' },
        { type: 'cut', fromStart: 1, fromEnd: 2 },
        { type: 'insert', text: 'x', position: 'index', index: 3 },
        { type: 'date', source: 'modified', format: 'YYYYMMDD', position: 'suffix', separator: '-' },
        { type: 'template', template: '{parent}_{name}' },
      ],
      sequence: { start: 0, digits: 4 },
      filters: { extensions: ['.JPG', 'png'], include: ['*.jpg'], exclude: ['x*'], recursive: true, maxFiles: 50 },
    });
    assert.equal(preset.mode === 'rules' && preset.rules.length, 10);
    assert.deepEqual(preset.filters.extensions, ['jpg', 'png']);
  });

  it('accepts null sequence in rules mode', () => {
    const preset = parsePreset({ mode: 'rules', rules: [{ type: 'accents' }], sequence: null });
    assert.equal(preset.mode === 'rules' && preset.sequence, null);
  });

  it('presets shipped in /presets are valid', async () => {
    const dir = path.join(process.cwd(), 'presets');
    const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
    assert.ok(files.length >= 2);
    for (const file of files) {
      parsePresetJson(await readFile(path.join(dir, file), 'utf8'));
    }
  });
});

describe('parsePreset: invalid input', () => {
  it('requires an object and a mode', () => {
    assert.ok(issuesOf(null)[0]?.includes('oggetto'));
    assert.ok(issuesOf([]).length > 0);
    assert.ok(issuesOf({}).some((i) => i.includes('mode')));
  });

  it('rejects unknown properties (typos are errors)', () => {
    assert.ok(issuesOf({ ...free(), colour: 1 }).some((i) => i.includes('colour')));
    assert.ok(issuesOf(free({ delimeter: '-' })).some((i) => i.includes('delimeter')));
    assert.ok(issuesOf({ mode: 'rules', rules: [{ type: 'case', mode: 'lower', extra: 1 }] }).some((i) => i.includes('extra')));
  });

  it('reports ALL problems at once', () => {
    const issues = issuesOf(free({ start: -1, step: 0, digits: 'x', scope: 'nope', reverse: 'yes' }));
    assert.ok(issues.length >= 5, issues.join('\n'));
  });

  it('validates numbers, digits and enums', () => {
    assert.ok(issuesOf(free({ start: 1.5 })).length > 0);
    assert.ok(issuesOf(free({ digits: 0 })).length > 0);
    assert.ok(issuesOf(free({ digits: 13 })).length > 0);
    assert.ok(issuesOf(free({ orderBy: 'color' })).length > 0);
  });

  it('rejects wrong versions and mixed modes', () => {
    assert.ok(issuesOf({ ...free(), version: 2 }).some((i) => i.includes('versione')));
    assert.ok(issuesOf({ ...free(), rules: [] }).length > 0);
    assert.ok(issuesOf({ mode: 'rules', rules: [{ type: 'accents' }], free: { name: 'x' } }).length > 0);
  });

  it('rejects empty and oversized rule lists', () => {
    assert.ok(issuesOf({ mode: 'rules', rules: [] }).length > 0);
    const many = Array.from({ length: MAX_RULES + 1 }, () => ({ type: 'accents' }));
    assert.ok(issuesOf({ mode: 'rules', rules: many }).length > 0);
  });

  it('rejects unsafe regular expressions at load time', () => {
    const issues = issuesOf({ mode: 'rules', rules: [{ type: 'replace', find: '(a+)+', with: '', regex: true }] });
    assert.ok(issues.some((i) => i.includes('quantificatori')));
    assert.ok(issuesOf({ ...free(), filters: { nameRegex: '(x*)*' } }).length > 0);
  });

  it('rejects bad templates and forbidden characters in names/delimiters', () => {
    assert.ok(issuesOf({ mode: 'rules', rules: [{ type: 'template', template: '{bogus}' }] }).length > 0);
    assert.ok(issuesOf(free({ name: 'a/b' })).length > 0);
    assert.ok(issuesOf(free({ name: '..\\x' })).length > 0);
    assert.ok(issuesOf(free({ delimiter: ':' })).length > 0);
    assert.ok(issuesOf(free({ name: '{name}' })).length > 0); // {name} is not available in free mode
  });

  it('requires mandatory rule fields', () => {
    assert.ok(issuesOf({ mode: 'rules', rules: [{ type: 'replace', find: 'a' }] }).length > 0);
    assert.ok(issuesOf({ mode: 'rules', rules: [{ type: 'insert', text: 'x', position: 'index' }] }).length > 0);
    assert.ok(issuesOf({ mode: 'rules', rules: [{ type: 'insert', text: 'x', position: 'after' }] }).length > 0);
    assert.ok(issuesOf({ mode: 'rules', rules: [{ type: 'affix' }] }).length > 0);
    assert.ok(issuesOf({ mode: 'rules', rules: [{ type: 'bogus' }] }).length > 0);
  });

  it('validates filters', () => {
    assert.ok(issuesOf({ ...free(), filters: { extensions: ['j/pg'] } }).length > 0);
    assert.ok(issuesOf({ ...free(), filters: { maxFiles: 0 } }).length > 0);
    assert.ok(issuesOf({ ...free(), filters: { recursive: 'yes' } }).length > 0);
  });
});

describe('parsePresetJson', () => {
  it('reports malformed JSON as a PresetError', () => {
    assert.throws(() => parsePresetJson('{nope'), PresetError);
  });
  it('rejects oversized input', () => {
    assert.throws(() => parsePresetJson(' '.repeat(MAX_PRESET_BYTES + 1)), PresetError);
  });
});

describe('presetRequiresExif', () => {
  it('is true only when EXIF dates are needed', () => {
    assert.equal(presetRequiresExif(parsePreset(free())), false);
    assert.equal(presetRequiresExif(parsePreset(free({ orderBy: 'exif' }))), true);
    assert.equal(presetRequiresExif(parsePreset({ mode: 'rules', rules: [{ type: 'date', source: 'exif' }] })), true);
    assert.equal(presetRequiresExif(parsePreset({ mode: 'rules', rules: [{ type: 'date', source: 'modified' }] })), false);
  });
});
