import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { buildPlan } from '../src/core/planner.js';
import type { Preset, Rule } from '../src/core/types.js';
import { entry, freePreset, rulesPreset, seededRandom } from './helpers/fixtures.js';

const names = (preset: Preset, files: string[], dir?: string) =>
  buildPlan(
    files.map((f) => entry(f, dir ? { dir } : {})),
    preset,
  ).items.map((i) => i.newBase);

describe('free name mode', () => {
  it('builds Name + delimiter + number + original extension (case preserved)', () => {
    const files = Array.from({ length: 12 }, (_, i) => `IMG_${String(i + 1).padStart(2, '0')}${i % 2 ? '.jpg' : '.JPG'}`);
    const result = names(freePreset({ name: 'Holiday', delimiter: '-' }), files);
    assert.equal(result[0], 'Holiday-01.JPG');
    assert.equal(result[1], 'Holiday-02.jpg');
    assert.equal(result[11], 'Holiday-12.jpg');
  });

  it('starts from the chosen number with automatic digits', () => {
    const files = Array.from({ length: 10 }, (_, i) => `f${i}.png`);
    const result = names(freePreset({ name: 'Nome', start: 95 }), files);
    assert.equal(result[0], 'Nome_095.png');
    assert.equal(result[9], 'Nome_104.png');
  });

  it('supports an empty delimiter and fixed digits', () => {
    assert.deepEqual(names(freePreset({ name: 'X', delimiter: '', digits: 3 }), ['a.txt']), ['X001.txt']);
  });

  it('expands {parent} and date tokens', () => {
    const preset = freePreset({ name: '{parent}_{date:YYYY}' });
    const plan = buildPlan([entry('a.jpg', { dir: path.resolve('/x/Trip') })], preset, { now: new Date(2031, 5, 1) });
    assert.equal(plan.items[0]?.newBase, 'Trip_2031_1.jpg');
  });

  it('handles files without extension and compound extensions', () => {
    assert.deepEqual(names(freePreset({ name: 'F' }), ['README']), ['F_1']);
    assert.deepEqual(names(freePreset({ name: 'F' }), ['b.tar.gz']), ['F_1.tar.gz']);
  });
});

describe('rules mode', () => {
  it('applies rules in order, then the numbering last', () => {
    const preset = rulesPreset(
      [
        { type: 'replace', find: 'IMG_', with: 'Vacanza_' },
        { type: 'case', mode: 'lower' },
        { type: 'separators', spaces: 'underscore', collapse: true },
      ],
      { start: 1, digits: 3, delimiter: '_' },
    );
    assert.deepEqual(names(preset, ['IMG_Big Day.JPG', 'IMG_Small.png']), ['vacanza_big_day_001.JPG', 'vacanza_small_002.png']);
  });

  it('works without numbering', () => {
    assert.deepEqual(names(rulesPreset([{ type: 'case', mode: 'upper' }]), ['abc.txt']), ['ABC.txt']);
  });

  it('never modifies the extension, whatever the rules do', () => {
    const preset = rulesPreset([
      { type: 'case', mode: 'lower' },
      { type: 'replace', find: 'jpg', with: 'png' },
      { type: 'removeChars', punctuation: true },
      { type: 'accents' },
    ]);
    assert.deepEqual(names(preset, ['Photo.JPG', 'jpg.jpg']), ['png.jpg', 'photo.JPG']);
  });

  it('property: extension is preserved for random names and rule sets', () => {
    const random = seededRandom(42);
    const alphabet = ['a', 'B', 'é', '1', ' ', '_', '-', '.', '(', ')', '😀', 'ß'];
    const exts = ['.jpg', '.JPEG', '.tar.gz', '', '.7z'];
    const ruleSets: Rule[][] = [
      [{ type: 'case', mode: 'title' }],
      [{ type: 'removeChars', punctuation: true, digits: true }, { type: 'accents' }],
      [{ type: 'cut', fromStart: 2, fromEnd: 1 }],
      [{ type: 'separators', spaces: 'dot', collapse: true, trim: true }],
      [{ type: 'replace', find: '.', with: '' }],
    ];
    for (let n = 0; n < 300; n += 1) {
      const stem = Array.from({ length: 1 + Math.floor(random() * 12) }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');
      const ext = exts[Math.floor(random() * exts.length)] ?? '';
      const file = entry(stem + ext);
      const rules = ruleSets[n % ruleSets.length] as Rule[];
      const plan = buildPlan([file], rulesPreset(rules, n % 2 === 0 ? { start: 1 } : null));
      const item = plan.items[0];
      assert.ok(item?.newBase.endsWith(file.ext), `${file.base} -> ${item?.newBase}`);
    }
  });
});

describe('statuses and summary', () => {
  it('marks files that do not change as unchanged', () => {
    const plan = buildPlan([entry('a.txt'), entry('B.txt')], rulesPreset([{ type: 'case', mode: 'lower' }]));
    assert.deepEqual(plan.items.map((i) => i.status), ['unchanged', 'rename']);
    assert.deepEqual(plan.summary, { total: 2, toRename: 1, unchanged: 1, blocked: 0, warnings: 0 });
    assert.equal(plan.hasBlockingIssues, false);
  });

  it('treats a Unicode-normalization-only difference as unchanged', () => {
    const plan = buildPlan([entry('cafe\u0301.txt')], rulesPreset([{ type: 'case', mode: 'lower' }]));
    assert.equal(plan.items[0]?.status, 'unchanged');
  });

  it('is deterministic whatever the input order', () => {
    const files = ['b.txt', 'a.txt', 'c10.txt', 'c2.txt'].map((f) => entry(f));
    const preset = freePreset({ name: 'X' });
    const one = buildPlan(files, preset).items.map((i) => [i.oldBase, i.newBase]);
    const two = buildPlan([...files].reverse(), preset).items.map((i) => [i.oldBase, i.newBase]);
    assert.deepEqual(one, two);
  });

  it('is pure: does not mutate its input', () => {
    const files = [entry('a.txt')];
    const snapshot = JSON.stringify(files);
    buildPlan(files, freePreset({ name: 'X' }));
    assert.equal(JSON.stringify(files), snapshot);
  });
});

describe('conflicts', () => {
  it('blocks duplicate targets', () => {
    const plan = buildPlan([entry('a1.txt'), entry('a2.txt')], rulesPreset([{ type: 'removeChars', digits: true }]));
    assert.equal(plan.hasBlockingIssues, true);
    assert.deepEqual(plan.items.map((i) => i.issues[0]?.code), ['DUPLICATE_TARGET', 'DUPLICATE_TARGET']);
  });

  it('treats names that differ only by case as the same target', () => {
    const plan = buildPlan([entry('a.txt'), entry('b.txt')], rulesPreset([{ type: 'replace', find: 'a', with: 'B' }, { type: 'replace', find: 'b', with: 'b' }]));
    assert.equal(plan.hasBlockingIssues, true);
  });

  it('does not report duplicates for files in different folders', () => {
    const plan = buildPlan(
      [entry('a1.txt', { dir: path.resolve('/x/A') }), entry('a2.txt', { dir: path.resolve('/x/B') })],
      rulesPreset([{ type: 'removeChars', digits: true }]),
    );
    assert.equal(plan.hasBlockingIssues, false);
  });

  it('blocks a target that already exists outside the batch (any case)', () => {
    const dir = path.resolve('/data/Album');
    const siblings = new Map([[dir, ['a.txt', 'B_1.TXT']]]);
    const plan = buildPlan([entry('a.txt')], freePreset({ name: 'b' }), { siblings });
    assert.equal(plan.items[0]?.issues[0]?.code, 'EXISTS_ON_DISK');
    assert.equal(plan.items[0]?.status, 'blocked');
  });

  it('also protects against folders with the same name', () => {
    const dir = path.resolve('/data/Album');
    const siblings = new Map([[dir, ['a.txt', 'b_1.txt']]]); // could be a folder: names only
    assert.equal(buildPlan([entry('a.txt')], freePreset({ name: 'b' }), { siblings }).hasBlockingIssues, true);
  });

  it('allows chains: a target freed by another file of the same batch', () => {
    const dir = path.resolve('/data/Album');
    const siblings = new Map([[dir, ['a.txt', 'b_1.txt']]]);
    const plan = buildPlan([entry('a.txt'), entry('b_1.txt')], freePreset({ name: 'b' }), { siblings });
    assert.equal(plan.hasBlockingIssues, false);
    assert.deepEqual(plan.items.map((i) => i.newBase), ['b_1.txt', 'b_2.txt']);
  });

  it('allows case-only renames', () => {
    const dir = path.resolve('/data/Album');
    const siblings = new Map([[dir, ['readme.md']]]);
    const plan = buildPlan([entry('readme.md')], rulesPreset([{ type: 'case', mode: 'upper' }]), { siblings });
    assert.equal(plan.items[0]?.status, 'rename');
    assert.equal(plan.items[0]?.newBase, 'README.md');
  });
});

describe('invalid results are blocked', () => {
  const blocked = (rules: Rule[], file = 'name.txt'): string | undefined =>
    buildPlan([entry(file)], rulesPreset(rules)).items[0]?.issues.find((i) => i.severity === 'error')?.code;

  it('empty name', () => assert.equal(blocked([{ type: 'cut', fromEnd: 50 }]), 'EMPTY_NAME'));
  it('Windows reserved name', () =>
    assert.equal(blocked([{ type: 'replace', find: '^.*$', with: 'con', regex: true }]), 'RESERVED_NAME'));
  it('trailing dot', () => assert.equal(blocked([{ type: 'affix', suffix: '.' }], 'name'), 'TRAILING_DOT_OR_SPACE'));
  it('too long', () => assert.equal(blocked([{ type: 'affix', prefix: 'x'.repeat(200) }, { type: 'affix', prefix: 'y'.repeat(100) }]), 'NAME_TOO_LONG'));
  it('forbidden characters', () => assert.equal(blocked([{ type: 'affix', prefix: 'a:b' }]), 'INVALID_CHARS'));
  it('a rule failing on one file does not break the others', () => {
    const preset: Preset = {
      version: 1,
      mode: 'rules',
      rules: [{ type: 'replace', find: '(a+)+$', with: 'x', regex: true }], // bypasses parsePreset on purpose
      sequence: null,
      filters: { extensions: [], include: [], exclude: [], recursive: false, includeHidden: false, maxFiles: 10 },
    };
    const plan = buildPlan([entry('a.txt'), entry('b.txt')], preset);
    assert.equal(plan.items.every((i) => i.issues[0]?.code === 'RULE_ERROR'), true);
    assert.equal(plan.hasBlockingIssues, true);
  });
});
