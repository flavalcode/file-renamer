import assert from 'node:assert/strict';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { planDirectory } from '../src/app/service.js';
import { RenamerError } from '../src/core/errors.js';
import { executePlan, undoLast } from '../src/fs/executor.js';
import { nodeFsPort } from '../src/fs/fs-port.js';
import type { FsPort } from '../src/fs/fs-port.js';
import { JournalStore } from '../src/fs/journal.js';
import { freePreset, listNames, makeFiles, manualPlan, readText, rulesPreset, withTempDir } from './helpers/fixtures.js';

/** Real file system with fault injection. `failAt` is the 1-based rename call that fails. */
function faultyPort(options: { failAt?: number; failAllAfter?: boolean; after?: (call: number) => Promise<void> }): FsPort & { calls: number } {
  const port = {
    calls: 0,
    kind: nodeFsPort.kind,
    async rename(from: string, to: string): Promise<void> {
      port.calls += 1;
      const failing = port.calls === options.failAt || (options.failAllAfter === true && options.failAt !== undefined && port.calls > options.failAt);
      if (failing) {
        throw Object.assign(new Error('EBUSY: resource busy (simulated)'), { code: 'EBUSY' });
      }
      await nodeFsPort.rename(from, to);
      await options.after?.(port.calls);
    },
  };
  return port;
}

const store = (dir: string): JournalStore => new JournalStore(path.join(dir, '.state'));

describe('executePlan', () => {
  it('renames files on disk keeping each file\'s content', async () => {
    await withTempDir(async (dir) => {
      const work = path.join(dir, 'work');
      await makeFiles(work, ['IMG_2.JPG', 'IMG_10.jpg', 'IMG_1.png']);
      const { plan } = await planDirectory(work, freePreset({ name: 'Trip', delimiter: '-' }));
      const result = await executePlan(plan, { journal: store(dir) });

      assert.equal(result.status, 'applied');
      assert.equal(result.renamed, 3);
      assert.deepEqual(await listNames(work), ['Trip-1.png', 'Trip-2.JPG', 'Trip-3.jpg']);
      assert.equal(await readText(path.join(work, 'Trip-1.png')), 'content-of:IMG_1.png');
      assert.equal(await readText(path.join(work, 'Trip-3.jpg')), 'content-of:IMG_10.jpg');
    });
  });

  it('works without a journal, and does nothing for an empty plan', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['a.txt']);
      assert.equal((await executePlan(manualPlan(dir, [['a.txt', 'b.txt']]))).status, 'applied');
      assert.equal((await executePlan(manualPlan(dir, []))).status, 'nothing_to_do');
    });
  });

  it('swaps two names', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['a.txt', 'b.txt']);
      await executePlan(manualPlan(dir, [['a.txt', 'b.txt'], ['b.txt', 'a.txt']]));
      assert.equal(await readText(path.join(dir, 'a.txt')), 'content-of:b.txt');
      assert.equal(await readText(path.join(dir, 'b.txt')), 'content-of:a.txt');
    });
  });

  it('handles cycles and shifted chains (a->b, b->c, c->a)', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['a.txt', 'b.txt', 'c.txt']);
      await executePlan(manualPlan(dir, [['a.txt', 'b.txt'], ['b.txt', 'c.txt'], ['c.txt', 'a.txt']]));
      assert.equal(await readText(path.join(dir, 'b.txt')), 'content-of:a.txt');
      assert.equal(await readText(path.join(dir, 'c.txt')), 'content-of:b.txt');
      assert.equal(await readText(path.join(dir, 'a.txt')), 'content-of:c.txt');
    });
  });

  it('applies case-only renames', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['readme.md']);
      const result = await executePlan(manualPlan(dir, [['readme.md', 'README.md']]));
      assert.equal(result.status, 'applied');
      assert.deepEqual(await listNames(dir), ['README.md']);
    });
  });

  it('renames files whose names differ only by case (case-sensitive file systems)', async (t) => {
    await withTempDir(async (dir) => {
      await writeFile(path.join(dir, 'Probe.txt'), 'x');
      if ((await listNames(dir)).length === 1 && (await nodeFsPort.kind(path.join(dir, 'probe.txt'))) !== 'missing') {
        t.skip('case-insensitive file system');
        return;
      }
      await makeFiles(dir, ['A.txt', 'a.TXT']);
      const { plan } = await planDirectory(dir, freePreset({ name: 'N' }, { includeHidden: false, extensions: ['txt'] }));
      const result = await executePlan(plan);
      assert.equal(result.status, 'applied');
      assert.equal(await readText(path.join(dir, 'N_1.txt')), 'content-of:A.txt');
      assert.equal(await readText(path.join(dir, 'N_2.TXT')), 'content-of:a.TXT');
    });
  });

  it('handles non-ASCII names', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['città è.txt', '😀.png']);
      await executePlan(manualPlan(dir, [['città è.txt', 'Città_1.txt'], ['😀.png', 'emoji_1.png']]));
      assert.deepEqual(await listNames(dir), ['Città_1.txt', 'emoji_1.png']);
    });
  });

  it('renames 500 files quickly with 3-digit numbering', async () => {
    await withTempDir(async (dir) => {
      const names = Array.from({ length: 500 }, (_, i) => `file-${i}.dat`);
      await makeFiles(dir, names);
      const started = Date.now();
      const { plan } = await planDirectory(dir, freePreset({ name: 'Batch' }));
      const result = await executePlan(plan, { journal: store(dir) });
      assert.equal(result.status, 'applied');
      assert.ok(Date.now() - started < 15_000);
      const after = (await listNames(dir)).filter((n) => n.startsWith('Batch_'));
      assert.equal(after.length, 500);
      assert.equal(after[0], 'Batch_001.dat');
      assert.equal(after[499], 'Batch_500.dat');
    });
  });

  it('refuses a plan with blocking issues and touches nothing', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['a1.txt', 'a2.txt']);
      const { plan } = await planDirectory(dir, rulesPreset([{ type: 'removeChars', digits: true }]));
      assert.equal(plan.hasBlockingIssues, true);
      await assert.rejects(executePlan(plan), (e: unknown) => e instanceof RenamerError && e.code === 'PLAN_BLOCKED');
      assert.deepEqual(await listNames(dir), ['a1.txt', 'a2.txt']);
    });
  });

  it('refuses operations that would leave the file\'s folder', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['a.txt']);
      const plan = manualPlan(dir, [['a.txt', 'b.txt']]);
      const evil = { ...plan, items: [{ ...plan.items[0]!, targetPath: path.join(dir, '..', 'escaped.txt') }] };
      await assert.rejects(executePlan(evil, { journal: store(dir) }), /UNSAFE|cartella/u);
      assert.deepEqual(await listNames(dir), ['a.txt']);
      assert.equal((await store(dir).list()).length, 0); // nothing journaled either
    });
  });

  it('does not rename anything if the undo log cannot be written', async () => {
    await withTempDir(async (dir) => {
      const work = path.join(dir, 'work');
      await makeFiles(work, ['a.txt']);
      await writeFile(path.join(dir, 'blocker'), 'a file, not a folder');
      const brokenStore = new JournalStore(path.join(dir, 'blocker', 'state'));
      await assert.rejects(executePlan(manualPlan(work, [['a.txt', 'b.txt']]), { journal: brokenStore }));
      assert.deepEqual(await listNames(work), ['a.txt']);
    });
  });
});

describe('executePlan: failures and rollback', () => {
  const names = ['a.txt', 'b.txt', 'c.txt'];
  const pairs: Array<[string, string]> = [['a.txt', 'x.txt'], ['b.txt', 'y.txt'], ['c.txt', 'z.txt']];

  const assertUntouched = async (dir: string): Promise<void> => {
    assert.deepEqual(await listNames(dir), names);
    for (const name of names) {
      assert.equal(await readText(path.join(dir, name)), `content-of:${name}`);
    }
  };

  // 3 files = 6 renames: calls 1-3 are phase 1, calls 4-6 are phase 2.
  for (const failAt of [1, 2, 3, 4, 5, 6]) {
    it(`restores everything when rename #${failAt} fails`, async () => {
      await withTempDir(async (dir) => {
        const work = path.join(dir, 'work');
        await makeFiles(work, names);
        const journal = store(dir);
        const result = await executePlan(manualPlan(work, pairs), { fs: faultyPort({ failAt }), journal });
        assert.equal(result.status, 'rolled_back');
        assert.match(result.failure ?? '', /EBUSY/u);
        assert.equal(result.renamed, 0);
        await assertUntouched(work);
        assert.equal((await journal.list())[0]?.journal.status, 'rolled_back');
        assert.equal(await journal.latestApplied(), null);
      });
    });
  }

  it('reports an incomplete rollback and leaves a recoverable state', async () => {
    await withTempDir(async (dir) => {
      const work = path.join(dir, 'work');
      await makeFiles(work, names);
      const journal = store(dir);
      const result = await executePlan(manualPlan(work, pairs), {
        fs: faultyPort({ failAt: 5, failAllAfter: true }),
        journal,
      });
      assert.equal(result.status, 'rollback_failed');
      assert.ok(result.rollbackErrors.length > 0);
      assert.equal((await journal.list())[0]?.journal.status, 'rollback_failed');
      // No data is lost: every file still exists under SOME name.
      const remaining = await listNames(work);
      assert.equal(remaining.length, 3);
    });
  });

  it('never overwrites a file that appears at a target before execution', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, names);
      const plan = manualPlan(dir, pairs);
      await writeFile(path.join(dir, 'y.txt'), 'precious');
      const result = await executePlan(plan);
      assert.equal(result.status, 'rolled_back');
      assert.equal(await readText(path.join(dir, 'y.txt')), 'precious');
      assert.deepEqual(await listNames(dir), ['a.txt', 'b.txt', 'c.txt', 'y.txt']);
    });
  });

  it('never overwrites a file that appears at a target DURING execution', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, names);
      const plan = manualPlan(dir, pairs);
      const port = faultyPort({
        after: async (call) => {
          if (call === 3) {
            // end of phase 1: a foreign file shows up at a target name
            await writeFile(path.join(dir, 'y.txt'), 'precious');
          }
        },
      });
      const result = await executePlan(plan, { fs: port });
      assert.equal(result.status, 'rolled_back');
      assert.equal(await readText(path.join(dir, 'y.txt')), 'precious');
      assert.deepEqual(await listNames(dir), ['a.txt', 'b.txt', 'c.txt', 'y.txt']);
    });
  });

  it('fails safely if a source disappeared after the preview', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, names);
      const plan = manualPlan(dir, pairs);
      await rename(path.join(dir, 'b.txt'), path.join(dir, 'moved-away.txt'));
      const result = await executePlan(plan);
      assert.equal(result.status, 'rolled_back');
      assert.deepEqual(await listNames(dir), ['a.txt', 'c.txt', 'moved-away.txt']);
    });
  });

  it('does not touch a folder that has the name of a source', async () => {
    await withTempDir(async (dir) => {
      await mkdir(path.join(dir, 'a.txt')); // a directory, not a file
      const result = await executePlan(manualPlan(dir, [['a.txt', 'b.txt']]));
      assert.equal(result.status, 'rolled_back');
      assert.deepEqual(await listNames(dir), ['a.txt']);
    });
  });
});

describe('undoLast', () => {
  it('restores the original names and contents, then reports nothing left to undo', async () => {
    await withTempDir(async (dir) => {
      const work = path.join(dir, 'work');
      await makeFiles(work, ['a.txt', 'b.txt']);
      const journal = store(dir);
      await executePlan(manualPlan(work, [['a.txt', 'b.txt'], ['b.txt', 'a.txt']]), { journal });

      const first = await undoLast(journal);
      assert.equal(first.status, 'applied');
      assert.equal(await readText(path.join(work, 'a.txt')), 'content-of:a.txt');
      assert.equal(await readText(path.join(work, 'b.txt')), 'content-of:b.txt');
      assert.equal((await journal.list())[0]?.journal.status, 'undone');

      assert.equal((await undoLast(journal)).status, 'nothing_to_do');
    });
  });

  it('restores names that differ only by case (case-sensitive file systems)', async (t) => {
    await withTempDir(async (dir) => {
      await writeFile(path.join(dir, 'Probe.txt'), 'x');
      if ((await nodeFsPort.kind(path.join(dir, 'probe.txt'))) !== 'missing') {
        t.skip('case-insensitive file system');
        return;
      }
      const work = path.join(dir, 'work');
      await makeFiles(work, ['A.txt', 'a.TXT']);
      const journal = store(dir);
      const { plan } = await planDirectory(work, freePreset({ name: 'N' }));
      await executePlan(plan, { journal });
      const result = await undoLast(journal);
      assert.equal(result.status, 'applied');
      assert.deepEqual(await listNames(work), ['A.txt', 'a.TXT']);
      assert.equal(await readText(path.join(work, 'A.txt')), 'content-of:A.txt');
    });
  });

  it('undoes only the most recent run each time', async () => {
    await withTempDir(async (dir) => {
      const work = path.join(dir, 'work');
      await makeFiles(work, ['a.txt']);
      const journal = store(dir);
      await executePlan(manualPlan(work, [['a.txt', 'b.txt']]), { journal });
      await new Promise((r) => setTimeout(r, 5));
      await executePlan(manualPlan(work, [['b.txt', 'c.txt']]), { journal });

      await undoLast(journal);
      assert.deepEqual(await listNames(work), ['b.txt']);
      await undoLast(journal);
      assert.deepEqual(await listNames(work), ['a.txt']);
    });
  });

  it('fails safely (and stays undoable) if a file changed since the rename', async () => {
    await withTempDir(async (dir) => {
      const work = path.join(dir, 'work');
      await makeFiles(work, ['a.txt']);
      const journal = store(dir);
      await executePlan(manualPlan(work, [['a.txt', 'b.txt']]), { journal });
      await rename(path.join(work, 'b.txt'), path.join(work, 'renamed-by-user.txt'));

      const result = await undoLast(journal);
      assert.equal(result.status, 'rolled_back');
      assert.equal((await journal.latestApplied())?.journal.status, 'applied');
      assert.deepEqual(await listNames(work), ['renamed-by-user.txt']);
    });
  });

  it('does not overwrite a new file that took the original name', async () => {
    await withTempDir(async (dir) => {
      const work = path.join(dir, 'work');
      await makeFiles(work, ['a.txt']);
      const journal = store(dir);
      await executePlan(manualPlan(work, [['a.txt', 'b.txt']]), { journal });
      await writeFile(path.join(work, 'a.txt'), 'new file');

      const result = await undoLast(journal);
      assert.equal(result.status, 'rolled_back');
      assert.equal(await readFile(path.join(work, 'a.txt'), 'utf8'), 'new file');
      assert.equal(await readText(path.join(work, 'b.txt')), 'content-of:a.txt');
    });
  });
});
