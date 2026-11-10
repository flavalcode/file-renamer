import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RenamerError } from '../src/core/errors.js';
import { assignSequence, computeDigits } from '../src/core/sequence.js';
import type { SequenceOptions } from '../src/core/types.js';
import { entry } from './helpers/fixtures.js';

const base: SequenceOptions = {
  start: 1,
  step: 1,
  digits: 'auto',
  delimiter: '_',
  scope: 'global',
  orderBy: 'name',
  reverse: false,
};
const numbers = (names: string[], options: Partial<SequenceOptions> = {}): string[] =>
  assignSequence(
    names.map((n) => entry(n)),
    { ...base, ...options },
  ).map((s) => `${s.entry.base}=${s.sequence}`);

describe('computeDigits (auto)', () => {
  const table: Array<[number, number, number, number]> = [
    // count, start, step, expected digits
    [7, 1, 1, 1],
    [9, 1, 1, 1],
    [10, 1, 1, 2],
    [12, 1, 1, 2],
    [99, 1, 1, 2],
    [100, 1, 1, 3],
    [120, 1, 1, 3],
    [10, 95, 1, 3], // 95..104
    [3, 0, 1, 1],
    [5, 10, 10, 2], // 10..50
    [11, 0, 10, 3], // 0..100
    [1, 1, 1, 1],
    [0, 1, 1, 1],
  ];
  for (const [count, start, step, expected] of table) {
    it(`${count} files, start ${start}, step ${step} -> ${expected} digits`, () => {
      assert.equal(computeDigits(count, { start, step, digits: 'auto' }), expected);
    });
  }
  it('honours a fixed number of digits', () => {
    assert.equal(computeDigits(3, { start: 1, step: 1, digits: 4 }), 4);
  });
});

describe('assignSequence', () => {
  it('pads to the digits of the last number', () => {
    const names = Array.from({ length: 12 }, (_, i) => `f${i + 1}.jpg`);
    const result = numbers(names);
    assert.equal(result[0], 'f1.jpg=01');
    assert.equal(result[11], 'f12.jpg=12');
  });

  it('starts from the chosen number and respects the step', () => {
    assert.deepEqual(numbers(['a.txt', 'b.txt', 'c.txt'], { start: 95, step: 5 }), [
      'a.txt=095',
      'b.txt=100',
      'c.txt=105',
    ]);
  });

  it('orders names naturally (2 before 10)', () => {
    assert.deepEqual(numbers(['img10.jpg', 'img2.jpg', 'img1.jpg']), ['img1.jpg=1', 'img2.jpg=2', 'img10.jpg=3']);
  });

  it('can reverse the order', () => {
    assert.deepEqual(numbers(['a.txt', 'b.txt'], { reverse: true }), ['b.txt=1', 'a.txt=2']);
  });

  it('keeps the given order in manual mode', () => {
    assert.deepEqual(numbers(['z.txt', 'a.txt'], { orderBy: 'manual' }), ['z.txt=1', 'a.txt=2']);
    assert.deepEqual(numbers(['z.txt', 'a.txt'], { orderBy: 'manual', reverse: true }), ['a.txt=1', 'z.txt=2']);
  });

  it('orders by modification date, size and EXIF date', () => {
    const files = [
      entry('a.jpg', { mtimeMs: 300, size: 1, exifDateMs: 20 }),
      entry('b.jpg', { mtimeMs: 100, size: 3, exifDateMs: 30 }),
      entry('c.jpg', { mtimeMs: 200, size: 2, exifDateMs: 10 }),
    ];
    const order = (orderBy: SequenceOptions['orderBy']): string =>
      assignSequence(files, { ...base, orderBy })
        .map((s) => s.entry.name)
        .join('');
    assert.equal(order('modified'), 'bca');
    assert.equal(order('size'), 'acb');
    assert.equal(order('exif'), 'cab');
  });

  it('restarts per folder, each group with its own digits', () => {
    const files = [
      ...Array.from({ length: 10 }, (_, i) => entry(`f${i}.jpg`, { dir: '/x/A' })),
      entry('g.jpg', { dir: '/x/B' }),
    ];
    const result = assignSequence(files, { ...base, scope: 'perFolder' });
    assert.equal(result.find((s) => s.entry.dir === '/x/A' && s.entry.base === 'f0.jpg')?.sequence, '01');
    assert.equal(result.find((s) => s.entry.dir === '/x/B')?.sequence, '1');
  });

  it('restarts per extension (case-insensitive)', () => {
    const result = numbers(['a.jpg', 'b.JPG', 'c.png'], { scope: 'perExtension' });
    assert.deepEqual(result, ['a.jpg=1', 'b.JPG=2', 'c.png=1']);
  });

  it('is independent of the input order', () => {
    const a = numbers(['b.txt', 'c.txt', 'a.txt']);
    const b = numbers(['a.txt', 'b.txt', 'c.txt']);
    assert.deepEqual(a, b);
  });

  for (const bad of [{ start: -1 }, { start: 1.5 }, { step: 0 }, { step: 1.2 }, { digits: 0 }, { digits: 13 }]) {
    it(`rejects invalid options ${JSON.stringify(bad)}`, () => {
      assert.throws(() => numbers(['a.txt'], bad as Partial<SequenceOptions>), RenamerError);
    });
  }
});
