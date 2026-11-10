import assert from 'node:assert/strict';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { JournalStore, defaultStateDir, parseJournal } from '../src/fs/journal.js';
import { withTempDir } from './helpers/fixtures.js';

const ops = (dir: string) => [{ from: path.join(dir, 'a.txt'), to: path.join(dir, 'b.txt') }];

describe('defaultStateDir', () => {
  it('uses the per-user location of each OS', () => {
    assert.equal(defaultStateDir({}, 'darwin', '/Users/f'), path.join('/Users/f', 'Library', 'Application Support', 'file-renamer'));
    assert.equal(defaultStateDir({ APPDATA: 'C:\\Roaming' }, 'win32', 'C:\\Users\\f'), path.join('C:\\Roaming', 'file-renamer'));
    assert.equal(defaultStateDir({}, 'linux', '/home/f'), path.join('/home/f', '.local', 'state', 'file-renamer'));
    assert.equal(defaultStateDir({ XDG_STATE_HOME: '/state' }, 'linux', '/home/f'), path.join('/state', 'file-renamer'));
  });
  it('honours FILE_RENAMER_HOME', () => {
    assert.equal(defaultStateDir({ FILE_RENAMER_HOME: '/custom' }, 'linux', '/h'), path.resolve('/custom'));
  });
});

describe('JournalStore', () => {
  it('creates, lists (newest first) and updates journals', async () => {
    await withTempDir(async (dir) => {
      const store = new JournalStore(path.join(dir, 'state'));
      await store.create('aaaaaaaa', ops(dir));
      await new Promise((r) => setTimeout(r, 5));
      await store.create('bbbbbbbb', ops(dir));
      assert.deepEqual((await store.list()).map((r) => r.journal.runId), ['bbbbbbbb', 'aaaaaaaa']);
      assert.equal(await store.latestApplied(), null); // still "pending"
      await store.setStatus('aaaaaaaa', 'applied');
      assert.equal((await store.latestApplied())?.journal.runId, 'aaaaaaaa');
    });
  });

  it('keeps only the most recent journals', async () => {
    await withTempDir(async (dir) => {
      const store = new JournalStore(path.join(dir, 'state'), 3);
      for (let i = 0; i < 6; i += 1) {
        await store.create(`0000000${i}`, ops(dir));
        await new Promise((r) => setTimeout(r, 3));
      }
      assert.equal((await store.list()).length, 3);
    });
  });

  it('writes owner-only files (POSIX)', async (t) => {
    if (process.platform === 'win32') {
      t.skip('POSIX permissions only');
      return;
    }
    await withTempDir(async (dir) => {
      const store = new JournalStore(path.join(dir, 'state'));
      await store.create('aaaaaaaa', ops(dir));
      const record = (await store.list())[0];
      assert.equal((await stat(record?.file ?? '')).mode & 0o777, 0o600);
      assert.equal((await stat(store.dir)).mode & 0o777, 0o700);
    });
  });

  it('ignores corrupt or tampered files', async () => {
    await withTempDir(async (dir) => {
      const store = new JournalStore(path.join(dir, 'state'));
      await store.create('aaaaaaaa', ops(dir));
      await writeFile(path.join(store.dir, '9999-corrupt.json'), '{not json');
      await writeFile(path.join(store.dir, '9999-bad.json'), JSON.stringify({ version: 1 }));
      assert.equal((await store.list()).length, 1);
      assert.ok((await readFile((await store.list())[0]?.file ?? '', 'utf8')).includes('aaaaaaaa'));
    });
  });

  it('returns an empty list when the folder does not exist', async () => {
    assert.deepEqual(await new JournalStore(path.join(path.resolve('/nonexistent-renamer'), 'x')).list(), []);
  });
});

describe('parseJournal (untrusted input)', () => {
  const valid = (dir: string) => ({
    version: 1,
    runId: 'abcdef01',
    createdAt: new Date().toISOString(),
    status: 'applied',
    operations: ops(dir),
  });

  it('accepts a well-formed journal', () => {
    assert.equal(parseJournal(valid(path.resolve('/x'))).runId, 'abcdef01');
  });

  const dir = path.resolve('/x');
  const bad: Array<[string, (j: ReturnType<typeof valid>) => unknown]> = [
    ['wrong version', (j) => ({ ...j, version: 2 })],
    ['bad run id', (j) => ({ ...j, runId: '../../etc' })],
    ['bad status', (j) => ({ ...j, status: 'hacked' })],
    ['bad date', (j) => ({ ...j, createdAt: 'yesterday' })],
    ['relative path', (j) => ({ ...j, operations: [{ from: 'a.txt', to: 'b.txt' }] })],
    ['move across folders', (j) => ({ ...j, operations: [{ from: path.join(dir, 'a'), to: path.join(path.resolve('/y'), 'a') }] })],
    ['NUL in path', (j) => ({ ...j, operations: [{ from: path.join(dir, 'a\0'), to: path.join(dir, 'b') }] })],
    ['non-string path', (j) => ({ ...j, operations: [{ from: 1, to: 2 }] })],
    ['operations not array', (j) => ({ ...j, operations: 'x' })],
    ['not an object', () => 'text'],
  ];
  for (const [label, mutate] of bad) {
    it(`rejects: ${label}`, () => {
      assert.throws(() => parseJournal(mutate(valid(dir))), /Registro di annullamento non valido/u);
    });
  }
});
