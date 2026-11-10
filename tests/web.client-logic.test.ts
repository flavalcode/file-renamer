import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parsePreset } from '../src/core/preset.js';
import { formatSize, displayPath, plural } from '../src/web/client/format.js';
import {
  buildPresetInput,
  buildRule,
  defaultForm,
  describeIssue,
  newRule,
} from '../src/web/client/preset-builder.js';
import { RULE_SCHEMAS } from '../src/web/client/rule-schemas.js';
import type { RenameForm } from '../src/web/client/preset-builder.js';

/** Minimal values that make every rule valid, per rule type. */
const REQUIRED: Record<string, Record<string, string | boolean>> = {
  replace: { find: 'a', with: 'b' },
  affix: { prefix: 'p' },
  insert: { text: 'x' },
  template: { template: '{parent}_{name}' },
};

describe('rule schemas stay in sync with the core', () => {
  it('covers every rule type implemented by the core', async () => {
    const source = await readFile(path.join(process.cwd(), 'src/core/preset.ts'), 'utf8');
    const match = /const RULE_TYPES = \[([^\]]+)\]/u.exec(source);
    const coreTypes = [...(match?.[1] ?? '').matchAll(/'(\w+)'/gu)].map((m) => m[1]).sort();
    assert.deepEqual(RULE_SCHEMAS.map((s) => s.type).sort(), coreTypes);
  });

  for (const schema of RULE_SCHEMAS) {
    it(`a freshly added "${schema.type}" rule produces JSON the core accepts`, () => {
      const draft = newRule(schema.type);
      Object.assign(draft.values, REQUIRED[schema.type] ?? {});
      const preset = parsePreset({ mode: 'rules', rules: [buildRule(draft)], sequence: null });
      assert.equal(preset.mode, 'rules');
    });
  }

  it('every field of every schema is a key the core accepts', () => {
    // Setting each field to a plausible value must never trigger "unknown property".
    for (const schema of RULE_SCHEMAS) {
      const draft = newRule(schema.type);
      Object.assign(draft.values, REQUIRED[schema.type] ?? {});
      for (const field of schema.fields) {
        if (field.kind === 'text' && draft.values[field.key] === '') draft.values[field.key] = 'x';
        if (field.kind === 'int') draft.values[field.key] = '2';
        if (field.showIf) draft.values[field.showIf.key] = field.showIf.in[0] ?? '';
      }
      assert.doesNotThrow(() => parsePreset({ mode: 'rules', rules: [buildRule(draft)] }), schema.type);
    }
  });
});

describe('buildRule', () => {
  it('omits empty optional text, keeps allowed empty text, sends booleans', () => {
    const draft = newRule('replace');
    draft.values['find'] = 'IMG_';
    assert.deepEqual(buildRule(draft), { type: 'replace', find: 'IMG_', with: '', caseSensitive: true, all: true, regex: false });
    const affix = newRule('affix');
    affix.values['prefix'] = '2026_';
    assert.deepEqual(buildRule(affix), { type: 'affix', prefix: '2026_' });
  });

  it('sends integers as numbers and passes invalid text through for the server to explain', () => {
    const cut = newRule('cut');
    cut.values['fromStart'] = ' 3 ';
    cut.values['fromEnd'] = 'abc';
    assert.deepEqual(buildRule(cut), { type: 'cut', fromStart: 3, fromEnd: 'abc' });
  });

  it('only includes fields that are visible', () => {
    const insert = newRule('insert');
    Object.assign(insert.values, { text: 'X', position: 'start', index: '5', anchor: 'zzz' });
    assert.deepEqual(buildRule(insert), { type: 'insert', text: 'X', position: 'start' });
    insert.values['position'] = 'index';
    assert.deepEqual(buildRule(insert), { type: 'insert', text: 'X', position: 'index', index: 5 });
  });
});

describe('buildPresetInput', () => {
  it('free mode: name + sequence defaults the core accepts', () => {
    const form = defaultForm();
    form.freeName = 'Vacanza';
    const input = buildPresetInput(form);
    assert.deepEqual(input, {
      version: 1,
      mode: 'free',
      free: { name: 'Vacanza', start: 1, step: 1, digits: 'auto', delimiter: '_', scope: 'global', orderBy: 'name', reverse: false },
    });
    assert.equal(parsePreset(input).mode, 'free');
  });

  it('custom delimiter, fixed digits, start from 95', () => {
    const form = defaultForm();
    form.freeName = 'N';
    Object.assign(form.numbering, { delimiter: 'custom', delimiterCustom: '--', digits: '4', start: '95' });
    const free = (buildPresetInput(form) as { free: Record<string, unknown> }).free;
    assert.equal(free['delimiter'], '--');
    assert.equal(free['digits'], 4);
    assert.equal(free['start'], 95);
  });

  it('rules mode: numbering optional', () => {
    const form: RenameForm = { ...defaultForm(), mode: 'rules', rules: [newRule('accents')] };
    assert.notEqual((buildPresetInput(form) as { sequence: unknown }).sequence, null);
    form.rulesNumbering = false;
    assert.equal((buildPresetInput(form) as { sequence: unknown }).sequence, null);
    assert.equal(parsePreset(buildPresetInput(form)).mode, 'rules');
  });

  it('an invalid number is reported by the core, not silently fixed', () => {
    const form = defaultForm();
    form.freeName = 'N';
    form.numbering.start = 'abc';
    assert.throws(() => parsePreset(buildPresetInput(form)), /start/u);
  });
});

describe('describeIssue', () => {
  it('translates paths into form labels', () => {
    const form: RenameForm = { ...defaultForm(), mode: 'rules', rules: [newRule('accents'), newRule('replace')] };
    assert.equal(describeIssue('$.free.start: deve essere un intero tra 0 e 1', form), 'Primo numero: deve essere un intero tra 0 e 1');
    assert.equal(describeIssue('$.sequence.digits: no', form), 'Cifre: no');
    assert.equal(describeIssue('$.rules[1].find: campo obbligatorio', form), 'Regola 2 (Trova e sostituisci) – Testo da cercare: campo obbligatorio');
    assert.equal(describeIssue('$.rules: deve essere un elenco di 1-50 regole', form), 'Regole: deve essere un elenco di 1-50 regole');
    assert.equal(describeIssue('$.mode: x', form), 'mode: x');
  });
});

describe('format helpers', () => {
  it('formats sizes, plurals and paths', () => {
    assert.equal(formatSize(512), '512 B');
    assert.match(formatSize(1536), /^1,5 KB$/u);
    assert.match(formatSize(5 * 1024 * 1024), /MB$/u);
    assert.equal(plural(1, 'file', 'file'), '1 file');
    assert.equal(plural(2, 'cartella', 'cartelle'), '2 cartelle');
    assert.equal(displayPath('', 'a.txt'), 'a.txt');
    assert.equal(displayPath('x/y', 'a.txt'), 'x/y/a.txt');
  });
});

describe('client security guard', () => {
  it('never builds HTML from strings (file names are untrusted)', async () => {
    const dir = path.join(process.cwd(), 'src/web/client');
    const files = (await readdir(dir)).filter((f) => f.endsWith('.ts'));
    assert.ok(files.length >= 10);
    for (const file of files) {
      const source = await readFile(path.join(dir, file), 'utf8');
      for (const banned of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(', 'new Function', 'setAttribute(\'style\'', 'createContextualFragment']) {
        assert.equal(source.includes(banned), false, `${file} uses ${banned}`);
      }
    }
  });

  it('the page has no inline script or style (required by the CSP)', async () => {
    const html = await readFile(path.join(process.cwd(), 'src/web/public/index.html'), 'utf8');
    assert.equal(/<script(?![^>]*\bsrc=)/iu.test(html), false);
    assert.equal(/<style/iu.test(html), false);
    assert.equal(/\sstyle=/iu.test(html), false);
    assert.equal(/\son\w+=/iu.test(html), false);
  });
});
