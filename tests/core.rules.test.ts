import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RuleError } from '../src/core/errors.js';
import { applyRule } from '../src/core/rules/index.js';
import type { RuleContext } from '../src/core/rules/index.js';
import { compileSafeRegExp } from '../src/core/rules/safe-regex.js';
import type { Issue, Rule } from '../src/core/types.js';
import { entry } from './helpers/fixtures.js';

function run(rule: Rule, name: string, overrides: Parameters<typeof entry>[1] = {}, now = new Date(2030, 0, 15, 10, 20, 30)) {
  const warnings: Array<Omit<Issue, 'severity'>> = [];
  const ctx: RuleContext = {
    entry: entry(`${name}.txt`, overrides),
    parentName: 'Trip 2026',
    now,
    warn: (w) => warnings.push(w),
  };
  return { result: applyRule(rule, name, ctx), warnings };
}
const out = (rule: Rule, name: string, overrides?: Parameters<typeof entry>[1]): string =>
  run(rule, name, overrides).result;

describe('replace', () => {
  it('is literal and case-sensitive by default', () => {
    assert.equal(out({ type: 'replace', find: 'IMG_', with: 'Holiday_' }, 'IMG_01 img_02'), 'Holiday_01 img_02');
  });
  it('can ignore case and replace only the first match', () => {
    assert.equal(out({ type: 'replace', find: 'a', with: 'X', caseSensitive: false, all: false }, 'bAaa'), 'bXaa');
  });
  it('does not interpret $ sequences in literal mode', () => {
    assert.equal(out({ type: 'replace', find: 'a', with: '$&$1' }, 'cat'), 'c$&$1t');
  });
  it('supports regex with capture groups', () => {
    assert.equal(out({ type: 'replace', find: '^IMG_(\\d+)$', with: 'Photo $1', regex: true }, 'IMG_007'), 'Photo 007');
  });
  it('rejects an empty search text', () => {
    assert.throws(() => out({ type: 'replace', find: '', with: 'x' }, 'abc'), RuleError);
  });
});

describe('affix', () => {
  it('adds prefix and suffix to the name', () => {
    assert.equal(out({ type: 'affix', prefix: '2026_', suffix: '_final' }, 'doc'), '2026_doc_final');
  });
});

describe('case', () => {
  it('lower / upper', () => {
    assert.equal(out({ type: 'case', mode: 'lower' }, 'My FILE'), 'my file');
    assert.equal(out({ type: 'case', mode: 'upper' }, 'My file'), 'MY FILE');
  });
  it('title case', () => {
    assert.equal(out({ type: 'case', mode: 'title' }, 'hello wORLD-foo_bar'), 'Hello World-Foo_Bar');
    assert.equal(out({ type: 'case', mode: 'title' }, "don't stop"), "Don't Stop");
  });
  it('sentence case', () => {
    assert.equal(out({ type: 'case', mode: 'sentence' }, 'hELLO wORLD'), 'Hello world');
    assert.equal(out({ type: 'case', mode: 'sentence' }, '123 abc'), '123 Abc');
  });
});

describe('separators', () => {
  it('replaces spaces, optionally collapsing repeats', () => {
    assert.equal(out({ type: 'separators', spaces: 'underscore' }, 'a  b c'), 'a__b_c');
    assert.equal(out({ type: 'separators', spaces: 'underscore', collapse: true }, 'a  b c'), 'a_b_c');
    assert.equal(out({ type: 'separators', spaces: 'dash' }, 'a b'), 'a-b');
    assert.equal(out({ type: 'separators', spaces: 'remove' }, 'a b c'), 'abc');
  });
  it('trims whitespace and separators at the ends', () => {
    assert.equal(out({ type: 'separators', trim: true }, '  _a_b-. '), 'a_b');
  });
});

describe('removeChars', () => {
  it('removes digits, punctuation, emoji, custom characters', () => {
    assert.equal(out({ type: 'removeChars', digits: true }, 'file 123 b2'), 'file  b');
    assert.equal(out({ type: 'removeChars', punctuation: true }, 'a-b_c!'), 'abc');
    assert.equal(out({ type: 'removeChars', emoji: true }, 'party \u{1F389} time'), 'party  time');
    assert.equal(out({ type: 'removeChars', custom: '#$' }, 'a#b$c'), 'abc');
  });
  it('removes bracketed segments together with the space before them', () => {
    assert.equal(out({ type: 'removeChars', brackets: true }, 'file (1)'), 'file');
    assert.equal(out({ type: 'removeChars', brackets: true }, 'a (b [c]) d'), 'a d');
  });
});

describe('accents', () => {
  it('strips diacritics and maps special letters', () => {
    assert.equal(out({ type: 'accents' }, 'Città è però Æsir ß Łódź'), 'Citta e pero AEsir ss Lodz');
  });
});

describe('cut', () => {
  it('cuts characters from start and end (code points, not UTF-16 units)', () => {
    assert.equal(out({ type: 'cut', fromStart: 2 }, 'abcdef'), 'cdef');
    assert.equal(out({ type: 'cut', fromEnd: 2 }, 'abcdef'), 'abcd');
    assert.equal(out({ type: 'cut', fromStart: 1, fromEnd: 3 }, 'abcdef'), 'bc');
    assert.equal(out({ type: 'cut', fromStart: 1 }, '\u{1F600}abc'), 'abc');
  });
  it('never fails when cutting more than the length', () => {
    assert.equal(out({ type: 'cut', fromStart: 10, fromEnd: 10 }, 'abc'), '');
  });
});

describe('insert', () => {
  it('inserts at start, end and index', () => {
    assert.equal(out({ type: 'insert', text: 'X', position: 'start' }, 'abc'), 'Xabc');
    assert.equal(out({ type: 'insert', text: 'X', position: 'end' }, 'abc'), 'abcX');
    assert.equal(out({ type: 'insert', text: 'X', position: 'index', index: 2 }, 'abcd'), 'abXcd');
    assert.equal(out({ type: 'insert', text: 'X', position: 'index', index: 99 }, 'abcd'), 'abcdX');
  });
  it('inserts before/after an anchor, and ignores files without it', () => {
    assert.equal(out({ type: 'insert', text: 'X', position: 'before', anchor: 'c' }, 'abcd'), 'abXcd');
    assert.equal(out({ type: 'insert', text: 'X', position: 'after', anchor: 'c' }, 'abcd'), 'abcXd');
    assert.equal(out({ type: 'insert', text: 'X', position: 'after', anchor: 'z' }, 'abcd'), 'abcd');
    assert.throws(() => out({ type: 'insert', text: 'X', position: 'after', anchor: '' }, 'abcd'), RuleError);
  });
});

describe('date', () => {
  const mtime = new Date(2026, 10, 9, 8, 5, 3).getTime();

  it('prefixes the modification date by default', () => {
    assert.equal(out({ type: 'date', source: 'modified' }, 'doc', { mtimeMs: mtime }), '2026-11-09_doc');
  });
  it('supports suffix, custom format and separator', () => {
    assert.equal(
      out({ type: 'date', source: 'modified', format: 'YYMMDD_HHmmss', position: 'suffix', separator: '-' }, 'doc', {
        mtimeMs: mtime,
      }),
      'doc-261109_080503',
    );
  });
  it('uses the injected clock for "today"', () => {
    assert.equal(out({ type: 'date', source: 'today' }, 'doc'), '2030-01-15_doc');
  });
  it('uses EXIF when available, otherwise falls back to mtime with a warning', () => {
    const exif = new Date(2024, 4, 17, 13, 45, 9).getTime();
    assert.equal(out({ type: 'date', source: 'exif' }, 'p', { exifDateMs: exif }), '2024-05-17_p');
    const missing = run({ type: 'date', source: 'exif' }, 'p', { mtimeMs: mtime, exifDateMs: null });
    assert.equal(missing.result, '2026-11-09_p');
    assert.equal(missing.warnings[0]?.code, 'EXIF_MISSING');
  });
});

describe('template', () => {
  it('expands name, parent and date tokens', () => {
    assert.equal(out({ type: 'template', template: '{parent}_{name}' }, 'doc'), 'Trip 2026_doc');
    assert.equal(out({ type: 'template', template: '{name}-{date:YYYY}' }, 'doc'), 'doc-2030');
  });
  it('supports literal braces', () => {
    assert.equal(out({ type: 'template', template: '{{{name}}}' }, 'doc'), '{doc}');
  });
  it('is single-pass: tokens inside a file name are NOT expanded again', () => {
    assert.equal(out({ type: 'template', template: '{name}' }, '{parent}'), '{parent}');
  });
  it('rejects unknown tokens and stray braces', () => {
    assert.throws(() => out({ type: 'template', template: '{nope}' }, 'x'), RuleError);
    assert.throws(() => out({ type: 'template', template: 'a{b' }, 'x'), RuleError);
  });
});

describe('compileSafeRegExp', () => {
  for (const evil of ['(a+)+$', '(a|aa)*', '(\\d+)*x', '(.*a){10,}', '((a+)b)+']) {
    it(`rejects catastrophic pattern ${evil}`, () => {
      assert.throws(() => compileSafeRegExp(evil, ''), RuleError);
    });
  }
  for (const fine of ['^IMG_(\\d+)', '\\s+', '(jpg|png)$', '[a-z]+\\d{2,4}', '\\(a+\\)+', '(\\d{2})+', '[(+*]+']) {
    it(`accepts ordinary pattern ${fine}`, () => {
      assert.ok(compileSafeRegExp(fine, '') instanceof RegExp);
    });
  }
  it('rejects empty, too long and invalid patterns', () => {
    assert.throws(() => compileSafeRegExp('', ''), RuleError);
    assert.throws(() => compileSafeRegExp('a'.repeat(201), ''), RuleError);
    assert.throws(() => compileSafeRegExp('(', ''), RuleError);
  });
  it('always enables the unicode flag', () => {
    assert.ok(compileSafeRegExp('a', 'i').unicode);
  });
});
