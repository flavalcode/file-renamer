import assert from 'node:assert/strict';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { DEFAULT_FILTERS } from '../src/core/preset.js';
import type { Filters } from '../src/core/types.js';
import { globToRegExp, scanDirectory } from '../src/fs/scanner.js';
import { makeFiles, withTempDir } from './helpers/fixtures.js';
import { buildJpeg } from './helpers/jpeg.js';

const scanNames = async (dir: string, filters: Partial<Filters> = {}): Promise<string[]> => {
  const { entries } = await scanDirectory(dir, { filters: { ...DEFAULT_FILTERS, ...filters } });
  return entries.map((e) => path.relative(dir, path.join(e.dir, e.base))).sort();
};

describe('scanDirectory', () => {
  it('lists regular files, skipping hidden and system files by default', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['a.txt', 'B.JPG', '.hidden', '~$lock.docx', 'Thumbs.db', 'sub/c.txt']);
      assert.deepEqual(await scanNames(dir), ['B.JPG', 'a.txt']);
      assert.deepEqual(await scanNames(dir, { includeHidden: true }), ['.hidden', 'B.JPG', 'Thumbs.db', 'a.txt', '~$lock.docx']);
    });
  });

  it('recurses only when asked', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['a.txt', 'sub/b.txt', 'sub/deep/c.txt']);
      assert.deepEqual(await scanNames(dir), ['a.txt']);
      assert.deepEqual(await scanNames(dir, { recursive: true }), ['a.txt', path.join('sub', 'b.txt'), path.join('sub', 'deep', 'c.txt')]);
    });
  });

  it('fills name, extension and metadata', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['Report.final.PDF', 'bundle.tar.gz']);
      const { entries } = await scanDirectory(dir, { filters: DEFAULT_FILTERS });
      const report = entries.find((e) => e.base === 'Report.final.PDF');
      assert.equal(report?.name, 'Report.final');
      assert.equal(report?.ext, '.PDF');
      assert.ok((report?.size ?? 0) > 0 && (report?.mtimeMs ?? 0) > 0 && (report?.birthtimeMs ?? 0) > 0);
      assert.equal(entries.find((e) => e.base === 'bundle.tar.gz')?.ext, '.tar.gz');
    });
  });

  it('filters by extension, glob and regex', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['a.jpg', 'b.PNG', 'c.txt', 'd.tar.gz', 'IMG_1.jpg']);
      assert.deepEqual(await scanNames(dir, { extensions: ['jpg', 'png'] }), ['IMG_1.jpg', 'a.jpg', 'b.PNG']);
      assert.deepEqual(await scanNames(dir, { extensions: ['gz'] }), ['d.tar.gz']);
      assert.deepEqual(await scanNames(dir, { extensions: ['tar.gz'] }), ['d.tar.gz']);
      assert.deepEqual(await scanNames(dir, { include: ['img_*'] }), ['IMG_1.jpg']);
      assert.deepEqual(await scanNames(dir, { exclude: ['*.jpg', '*.png'] }), ['c.txt', 'd.tar.gz']);
      assert.deepEqual(await scanNames(dir, { nameRegex: '^[a-b]\\.' }), ['a.jpg', 'b.PNG']);
    });
  });

  it('collects every sibling name (files, folders, hidden) for collision checks', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['a.txt', '.hidden']);
      await mkdir(path.join(dir, 'folder'));
      const { siblings, root } = await scanDirectory(dir, { filters: DEFAULT_FILTERS });
      assert.deepEqual([...(siblings.get(root) ?? [])].sort(), ['.hidden', 'a.txt', 'folder']);
    });
  });

  it('refuses to exceed maxFiles instead of silently truncating', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['1.txt', '2.txt', '3.txt']);
      await assert.rejects(scanDirectory(dir, { filters: { ...DEFAULT_FILTERS, maxFiles: 2 } }), /Troppi file/u);
    });
  });

  it('fails clearly for a missing folder or a file path', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['a.txt']);
      await assert.rejects(scanDirectory(path.join(dir, 'nope'), { filters: DEFAULT_FILTERS }), /non trovata/u);
      await assert.rejects(scanDirectory(path.join(dir, 'a.txt'), { filters: DEFAULT_FILTERS }), /Non è una cartella/u);
    });
  });

  it('reads EXIF dates only when requested', async () => {
    await withTempDir(async (dir) => {
      await writeFile(path.join(dir, 'p.jpg'), buildJpeg('2024:05:17 13:45:09'));
      const without = await scanDirectory(dir, { filters: DEFAULT_FILTERS });
      const withExif = await scanDirectory(dir, { filters: DEFAULT_FILTERS, loadExif: true });
      assert.equal(without.entries[0]?.exifDateMs, null);
      assert.equal(withExif.entries[0]?.exifDateMs, new Date(2024, 4, 17, 13, 45, 9).getTime());
    });
  });

  it('never follows or lists symbolic links', async (t) => {
    await withTempDir(async (outside) => {
      await withTempDir(async (dir) => {
        await makeFiles(outside, ['secret.txt']);
        await makeFiles(dir, ['real.txt']);
        try {
          await symlink(path.join(outside, 'secret.txt'), path.join(dir, 'link.txt'));
          await symlink(outside, path.join(dir, 'linkdir'), 'dir');
        } catch {
          t.skip('symlinks not permitted on this system');
          return;
        }
        const { entries, skipped } = await scanDirectory(dir, { filters: { ...DEFAULT_FILTERS, recursive: true } });
        assert.deepEqual(entries.map((e) => e.base), ['real.txt']);
        assert.equal(skipped.symlinks, 2);
      });
    });
  });
});

describe('globToRegExp', () => {
  it('supports * and ? case-insensitively, anchored', () => {
    assert.ok(globToRegExp('*.jpg').test('A.JPG'));
    assert.ok(!globToRegExp('*.jpg').test('a.jpgx'));
    assert.ok(globToRegExp('img_?.png').test('IMG_1.png'));
    assert.ok(!globToRegExp('img_?.png').test('IMG_12.png'));
  });
  it('treats every other character literally', () => {
    assert.ok(!globToRegExp('a.b').test('axb'));
    assert.ok(globToRegExp('(1)*').test('(1) copy.txt'));
    assert.ok(globToRegExp('[x]*').test('[x]a'));
  });
});
