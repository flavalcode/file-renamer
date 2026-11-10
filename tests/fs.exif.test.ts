import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseExifDate, parseExifDateString, readExifDate } from '../src/fs/exif.js';
import { seededRandom, withTempDir } from './helpers/fixtures.js';
import { buildJpeg } from './helpers/jpeg.js';

const expected = new Date(2024, 4, 17, 13, 45, 9).getTime();

describe('parseExifDate', () => {
  it('reads DateTimeOriginal (little- and big-endian)', () => {
    assert.equal(parseExifDate(buildJpeg('2024:05:17 13:45:09', { little: true })), expected);
    assert.equal(parseExifDate(buildJpeg('2024:05:17 13:45:09', { little: false })), expected);
  });

  it('falls back to the IFD0 DateTime tag', () => {
    assert.equal(parseExifDate(buildJpeg('2024:05:17 13:45:09', { inExifIfd: false })), expected);
  });

  it('rejects implausible dates', () => {
    for (const bad of ['0000:00:00 00:00:00', '2024:13:01 00:00:00', '2024:05:17 25:00:00', 'not a date at all!!']) {
      assert.equal(parseExifDateString(bad), null, bad);
    }
    assert.equal(parseExifDate(buildJpeg('0000:00:00 00:00:00')), null);
  });

  it('returns null for non-JPEG data', () => {
    assert.equal(parseExifDate(Buffer.alloc(0)), null);
    assert.equal(parseExifDate(Buffer.from('hello world, definitely not a jpeg')), null);
  });

  it('never throws on truncated files (every possible length)', () => {
    const jpeg = buildJpeg('2024:05:17 13:45:09');
    for (let length = 0; length <= jpeg.length; length += 1) {
      assert.doesNotThrow(() => parseExifDate(jpeg.subarray(0, length)));
    }
  });

  it('never throws or hangs on corrupted / random data (fuzz)', () => {
    const random = seededRandom(7);
    const valid = buildJpeg('2024:05:17 13:45:09');
    for (let i = 0; i < 3000; i += 1) {
      const mutated = Buffer.from(valid);
      const flips = 1 + Math.floor(random() * 6);
      for (let f = 0; f < flips; f += 1) {
        mutated[Math.floor(random() * mutated.length)] = Math.floor(random() * 256);
      }
      const result = parseExifDate(mutated);
      assert.ok(result === null || Number.isFinite(result));

      const noise = Buffer.alloc(Math.floor(random() * 300));
      noise.forEach((_, index) => (noise[index] = Math.floor(random() * 256)));
      if (noise.length > 2) {
        noise[0] = 0xff;
        noise[1] = 0xd8;
      }
      assert.doesNotThrow(() => parseExifDate(noise));
    }
  });
});

describe('readExifDate', () => {
  it('reads from disk, returns null for missing or non-image files', async () => {
    await withTempDir(async (dir) => {
      const good = path.join(dir, 'a.jpg');
      const bad = path.join(dir, 'b.jpg');
      await writeFile(good, buildJpeg('2024:05:17 13:45:09'));
      await writeFile(bad, 'plain text');
      assert.equal(await readExifDate(good), expected);
      assert.equal(await readExifDate(bad), null);
      assert.equal(await readExifDate(path.join(dir, 'missing.jpg')), null);
    });
  });
});
