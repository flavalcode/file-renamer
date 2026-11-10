import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collisionKey, splitFileName } from '../src/core/filename.js';
import { naturalCompare } from '../src/core/natural-sort.js';
import { validateFileName } from '../src/core/validation.js';

describe('splitFileName', () => {
  const cases: Array<[string, string, string]> = [
    ['photo.JPG', 'photo', '.JPG'],
    ['archive.tar.gz', 'archive', '.tar.gz'],
    ['ARCHIVE.TAR.GZ', 'ARCHIVE', '.TAR.GZ'],
    ['a.b.c.txt', 'a.b.c', '.txt'],
    ['README', 'README', ''],
    ['.DS_Store', '.DS_Store', ''],
    ['.gitignore.bak', '.gitignore', '.bak'],
    ['file.', 'file.', ''],
    ['Report v1.5 final', 'Report v1.5 final', ''],
    ['.tar.gz', '.tar', '.gz'],
  ];
  for (const [input, name, ext] of cases) {
    it(`"${input}" -> "${name}" + "${ext}"`, () => {
      assert.deepEqual(splitFileName(input), { name, ext });
    });
  }

  it('name + ext always rebuild the original', () => {
    for (const [input] of cases) {
      const { name, ext } = splitFileName(input);
      assert.equal(name + ext, input);
    }
  });
});

describe('collisionKey', () => {
  it('ignores case and Unicode normalization form', () => {
    assert.equal(collisionKey('Caf\u00e9.TXT'), collisionKey('cafe\u0301.txt'));
  });
});

describe('naturalCompare', () => {
  it('orders numbers naturally and ignores case', () => {
    const sorted = ['file10', 'file2', 'File1'].sort(naturalCompare);
    assert.deepEqual(sorted, ['File1', 'file2', 'file10']);
  });
  it('is deterministic on ties', () => {
    assert.deepEqual(['a', 'A'].sort(naturalCompare), ['A', 'a']);
    assert.deepEqual(['A', 'a'].sort(naturalCompare), ['A', 'a']);
  });
});

describe('validateFileName', () => {
  const codes = (stem: string, ext = '', dir?: string): string[] =>
    validateFileName(stem, ext, dir).map((i) => i.code);

  it('accepts ordinary names, accents and spaces', () => {
    assert.deepEqual(codes('Città vecchia 01', '.jpg'), []);
  });

  for (const char of ['<', '>', ':', '"', '/', '\\', '|', '?', '*', '\u0000', '\n']) {
    it(`rejects forbidden character ${JSON.stringify(char)}`, () => {
      assert.ok(codes(`a${char}b`, '.txt').includes('INVALID_CHARS'));
    });
  }

  for (const reserved of ['CON', 'con', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT9', 'Con ']) {
    it(`rejects reserved Windows name "${reserved}"`, () => {
      assert.ok(codes(reserved, '.txt').includes('RESERVED_NAME'));
    });
  }
  it('does not reject look-alike names', () => {
    for (const ok of ['CONSOLE', 'com10', 'NULL', 'aux1']) {
      assert.deepEqual(codes(ok, '.txt'), [], ok);
    }
  });

  it('rejects trailing dot or space, and empty names', () => {
    assert.ok(codes('name ', '').includes('TRAILING_DOT_OR_SPACE'));
    assert.ok(codes('name.', '').includes('TRAILING_DOT_OR_SPACE'));
    assert.ok(codes('', '.jpg').includes('EMPTY_NAME'));
    assert.ok(codes('.', '').includes('EMPTY_NAME'));
  });

  it('limits the length in bytes AND UTF-16 units', () => {
    assert.deepEqual(codes('a'.repeat(251), '.jpg'), []); // 255 total
    assert.ok(codes('a'.repeat(252), '.jpg').includes('NAME_TOO_LONG'));
    // 70 emoji = 140 UTF-16 units but 280 UTF-8 bytes
    assert.ok(codes('\u{1F600}'.repeat(70), '.jpg').includes('NAME_TOO_LONG'));
  });

  it('rejects bidirectional control characters', () => {
    assert.ok(codes('invoice\u202Etxt.exe', '').includes('SUSPICIOUS_UNICODE'));
  });

  it('warns (does not fail) when the full path is longer than Windows MAX_PATH', () => {
    const issues = validateFileName('a', '.txt', `/${'d'.repeat(300)}`);
    assert.equal(issues.length, 1);
    assert.equal(issues[0]?.severity, 'warning');
  });
});
