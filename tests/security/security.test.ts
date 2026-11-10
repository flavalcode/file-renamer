/**
 * Security-oriented tests. Each group maps to a threat in docs/SECURITY.md.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { planDirectory } from '../../src/app/service.js';
import { PresetError } from '../../src/core/errors.js';
import { buildPlan } from '../../src/core/planner.js';
import { MAX_PRESET_BYTES, parsePreset, parsePresetJson } from '../../src/core/preset.js';
import { compileSafeRegExp } from '../../src/core/rules/index.js';
import { EXIT, runCli } from '../../src/cli/run.js';
import { executePlan, undoLast } from '../../src/fs/executor.js';
import { JournalStore } from '../../src/fs/journal.js';
import { loadPresetFile } from '../../src/fs/preset-file.js';
import { entry, fakeIo, freePreset, listNames, makeFiles, manualPlan, rulesPreset, withTempDir } from '../helpers/fixtures.js';

describe('T1 - path traversal and injection through names', () => {
  const payloads = ['../escape', '..\\escape', 'a/b', 'a\\b', '/etc/passwd', 'C:\\Windows\\x', 'a\u0000b', 'x:y'];

  for (const payload of payloads) {
    it(`free name ${JSON.stringify(payload)} is rejected when the preset is loaded`, () => {
      assert.throws(() => freePreset({ name: payload }), PresetError);
    });

    it(`a rule that produces ${JSON.stringify(payload)} is blocked in the plan`, () => {
      // Bypass preset validation on purpose: the planner must still refuse the result.
      const plan = buildPlan(
        [entry('file.txt')],
        {
          version: 1,
          mode: 'rules',
          rules: [{ type: 'replace', find: 'file', with: payload }],
          sequence: null,
          filters: { extensions: [], include: [], exclude: [], recursive: false, includeHidden: false, maxFiles: 10 },
        },
      );
      assert.equal(plan.items[0]?.status, 'blocked', payload);
    });
  }

  it('a file whose NAME looks like a path or token cannot escape or inject', () => {
    const plan = buildPlan(
      [entry('{parent}..x.txt'), entry('$&.txt')],
      rulesPreset([{ type: 'template', template: 'new-{name}' }]),
    );
    assert.deepEqual(plan.items.map((i) => i.newBase).sort(), ['new-$&.txt', 'new-{parent}..x.txt']);
    for (const item of plan.items) {
      assert.equal(path.dirname(item.targetPath), path.dirname(item.sourcePath));
    }
  });

  it('every planned target stays in the folder of its source (random hostile rules)', () => {
    const plan = buildPlan(
      [entry('a.txt'), entry('b.txt')],
      rulesPreset([{ type: 'affix', prefix: 'x', suffix: 'y' }, { type: 'insert', text: 'z', position: 'index', index: 1 }]),
    );
    for (const item of plan.items) {
      assert.equal(path.dirname(item.targetPath), path.dirname(item.sourcePath));
      assert.equal(path.basename(item.targetPath), item.newBase);
    }
  });

  it('"." and ".." can never become a whole file name', () => {
    for (const dots of ['.', '..']) {
      const plan = buildPlan([entry('file')], rulesPreset([{ type: 'replace', find: 'file', with: dots }]));
      assert.equal(plan.items[0]?.status, 'blocked', dots);
    }
  });

  it('bidirectional-text spoofing is blocked', () => {
    const plan = buildPlan([entry('a.txt')], rulesPreset([{ type: 'affix', prefix: 'gpj.\u202E' }]));
    assert.equal(plan.items[0]?.issues.some((i) => i.code === 'SUSPICIOUS_UNICODE'), true);
  });
});

describe('T2 - regular-expression denial of service', () => {
  it('classic evil patterns are refused before they can run', () => {
    const started = Date.now();
    for (const evil of ['(a+)+$', '(a*)*b', '(a|a)*c', '(.*)*x', '(a+){2,}$']) {
      assert.throws(() => compileSafeRegExp(evil, ''), /Espressione regolare/u, evil);
    }
    assert.ok(Date.now() - started < 200);
  });

  it('accepted patterns stay fast on hostile 255-character names', () => {
    const hostile = `${'a'.repeat(254)}!`;
    const started = Date.now();
    for (const pattern of ['^[ab]+$', '^a+b', '\\s+', '(\\d+)_(\\d+)', '.*x']) {
      compileSafeRegExp(pattern, '').test(hostile);
    }
    assert.ok(Date.now() - started < 500);
  });

  it('presets cannot smuggle an unsafe pattern in any field', () => {
    assert.throws(() => rulesPreset([{ type: 'replace', find: '(a+)+', with: '', regex: true }]), PresetError);
    assert.throws(() => freePreset({ name: 'x' }, { nameRegex: '(a+)+' }), PresetError);
  });
});

describe('T3 - malicious or oversized preset files', () => {
  it('rejects prototype-pollution attempts and does not pollute Object.prototype', () => {
    const attempts = [
      '{"__proto__":{"polluted":true},"mode":"free","free":{"name":"x"}}',
      '{"mode":"free","free":{"name":"x","__proto__":{"polluted":true}}}',
      '{"mode":"rules","rules":[{"type":"accents","constructor":{"prototype":{"polluted":true}}}]}',
    ];
    for (const text of attempts) {
      assert.throws(() => parsePresetJson(text), PresetError);
    }
    assert.equal(({} as Record<string, unknown>)['polluted'], undefined);
  });

  it('the parsed preset only contains known properties', () => {
    const preset = parsePreset({ mode: 'free', free: { name: 'x' } });
    assert.deepEqual(Object.keys(preset).sort(), ['filters', 'free', 'mode', 'version']);
  });

  it('refuses huge files without reading them', async () => {
    await withTempDir(async (dir) => {
      const file = path.join(dir, 'huge.json');
      await writeFile(file, ' '.repeat(MAX_PRESET_BYTES + 10));
      await assert.rejects(loadPresetFile(file), /supera/u);
      await assert.rejects(loadPresetFile(dir), PresetError); // a folder is not a preset
      await assert.rejects(loadPresetFile(path.join(dir, 'missing.json')), PresetError);
    });
  });

  it('bounds the amount of work a preset can request', () => {
    assert.throws(() => rulesPreset(Array.from({ length: 51 }, () => ({ type: 'accents' }))), PresetError);
    assert.throws(() => freePreset({ name: 'x'.repeat(256) }), PresetError);
    assert.throws(() => freePreset({ name: 'x' }, { maxFiles: 10_000_000 }), PresetError);
    assert.throws(() => freePreset({ name: 'x', start: 2_000_000_000 }), PresetError);
  });
});

describe('T4 - symbolic links and data outside the chosen folder', () => {
  it('never renames or follows a symlink; the target file stays untouched', async (t) => {
    await withTempDir(async (outside) => {
      await withTempDir(async (dir) => {
        await makeFiles(outside, ['secret.txt']);
        await makeFiles(dir, ['mine.txt']);
        try {
          await symlink(path.join(outside, 'secret.txt'), path.join(dir, 'link.txt'));
          await symlink(outside, path.join(dir, 'folder-link'), 'dir');
        } catch {
          t.skip('symlinks not permitted on this system');
          return;
        }
        const { plan } = await planDirectory(dir, freePreset({ name: 'X' }, { recursive: true }));
        assert.deepEqual(plan.items.map((i) => i.oldBase), ['mine.txt']);
        await executePlan(plan);
        assert.deepEqual(await listNames(outside), ['secret.txt']);
        assert.equal((await readdir(dir)).includes('link.txt'), true);
      });
    });
  });

  it('a symlink replaced for a source after the preview is not renamed', async (t) => {
    await withTempDir(async (outside) => {
      await withTempDir(async (dir) => {
        await makeFiles(outside, ['secret.txt']);
        await makeFiles(dir, ['a.txt']);
        const plan = manualPlan(dir, [['a.txt', 'b.txt']]);
        try {
          await rm(path.join(dir, 'a.txt'));
          await symlink(path.join(outside, 'secret.txt'), path.join(dir, 'a.txt'));
        } catch {
          t.skip('symlinks not permitted on this system');
          return;
        }
        const result = await executePlan(plan);
        assert.equal(result.status, 'rolled_back');
        assert.deepEqual(await listNames(outside), ['secret.txt']);
      });
    });
  });
});

describe('T5 - data loss: overwriting and partial failures', () => {
  it('a preview-time collision with an existing file is blocked in the plan AND in the CLI', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['a.txt', 'Keep_1.txt']);
      const io = fakeIo({ cwd: dir });
      const code = await runCli(['.', '--name', 'Keep', '--include', 'a.txt', '--apply', '--yes', '--state-dir', path.join(dir, '..', 'st')], io);
      assert.equal(code, EXIT.blocked);
      assert.equal(await readFile(path.join(dir, 'Keep_1.txt'), 'utf8'), 'content-of:Keep_1.txt');
    });
  });

  it('the CLI never modifies files without --apply, whatever else is passed', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['a.txt', 'b.txt']);
      const before = await listNames(dir);
      await runCli(['.', '--name', 'Z', '--yes', '--json'], fakeIo({ cwd: dir }));
      assert.deepEqual(await listNames(dir), before);
    });
  });
});

describe('T6 - tampered undo log', () => {
  it('a journal that moves files across folders is ignored and nothing is touched', async () => {
    await withTempDir(async (dir) => {
      const victimDir = path.join(dir, 'victim');
      await makeFiles(victimDir, ['important.txt']);
      const store = new JournalStore(path.join(dir, 'state'));
      await mkdir(store.dir, { recursive: true });
      await writeFile(
        path.join(store.dir, '2999-01-01T00-00-00-000Z-abcdef01.json'),
        JSON.stringify({
          version: 1,
          runId: 'abcdef01',
          createdAt: new Date().toISOString(),
          status: 'applied',
          operations: [{ from: path.join(dir, 'elsewhere', 'x.txt'), to: path.join(victimDir, 'important.txt') }],
        }),
      );
      assert.equal(await store.latestApplied(), null);
      assert.equal((await undoLast(store)).status, 'nothing_to_do');
      assert.equal(await readFile(path.join(victimDir, 'important.txt'), 'utf8'), 'content-of:important.txt');
    });
  });

  it('a same-folder journal can only rename inside that folder and never overwrites', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['new.txt', 'old.txt']);
      const store = new JournalStore(path.join(dir, 'state'));
      await store.create('abcdef01', [{ from: path.join(dir, 'old.txt'), to: path.join(dir, 'new.txt') }]);
      await store.setStatus('abcdef01', 'applied');
      const result = await undoLast(store); // old.txt already exists: must refuse
      assert.equal(result.status, 'rolled_back');
      assert.equal(await readFile(path.join(dir, 'old.txt'), 'utf8'), 'content-of:old.txt');
      assert.equal(await readFile(path.join(dir, 'new.txt'), 'utf8'), 'content-of:new.txt');
    });
  });

  it('journal files are not world-readable (POSIX)', async (t) => {
    if (process.platform === 'win32') {
      t.skip('POSIX permissions only');
      return;
    }
    await withTempDir(async (dir) => {
      const store = new JournalStore(path.join(dir, 'state'));
      await store.create('abcdef01', [{ from: path.join(dir, 'a'), to: path.join(dir, 'b') }]);
      const file = (await store.list())[0]?.file ?? '';
      assert.equal((await stat(file)).mode & 0o077, 0);
    });
  });
});

describe('T7 - resource exhaustion', () => {
  it('stops at maxFiles instead of silently processing a partial set', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, Array.from({ length: 20 }, (_, i) => `f${i}.txt`));
      await assert.rejects(planDirectory(dir, freePreset({ name: 'x' }, { maxFiles: 10 })), /Troppi file/u);
    });
  });

  it('error messages do not leak stack traces unless RENAMER_DEBUG is set', async () => {
    const io = fakeIo({ cwd: process.cwd() });
    await runCli(['./does-not-exist', '--name', 'x'], io);
    assert.equal(io.stderrText().includes(' at '), false);
  });
});
