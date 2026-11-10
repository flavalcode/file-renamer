import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseCommandLine, UsageError } from '../src/cli/args.js';
import { EXIT, runCli } from '../src/cli/run.js';
import { VERSION } from '../src/version.js';
import { fakeIo, listNames, makeFiles, withTempDir } from './helpers/fixtures.js';

/** Runs the CLI against a temp folder; the undo log goes to a sibling folder of the temp dir. */
async function cli(dir: string, args: string[], io = fakeIo({ cwd: dir })) {
  const state = path.join(dir, '..', `${path.basename(dir)}-state`);
  const code = await runCli([...args, '--state-dir', state], io);
  return { code, out: io.stdoutText(), err: io.stderrText() };
}

describe('CLI: dry-run is the default', () => {
  it('previews without touching any file', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['IMG_1.JPG', 'IMG_2.jpg']);
      const { code, out } = await cli(dir, ['.', '--name', 'Holiday']);
      assert.equal(code, EXIT.ok);
      assert.match(out, /Holiday_1\.JPG/u);
      assert.match(out, /Holiday_2\.jpg/u);
      assert.match(out, /nessun file modificato/u);
      assert.deepEqual(await listNames(dir), ['IMG_1.JPG', 'IMG_2.jpg']);
    });
  });
});

describe('CLI: apply, history and undo', () => {
  it('applies with --apply --yes, then undoes', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['b.txt', 'a.txt']);
      const applied = await cli(dir, ['.', '--name', 'Doc', '--digits', '3', '--start', '10', '--apply', '--yes']);
      assert.equal(applied.code, EXIT.ok);
      assert.deepEqual(await listNames(dir), ['Doc_010.txt', 'Doc_011.txt']);
      assert.equal(await readFile(path.join(dir, 'Doc_010.txt'), 'utf8'), 'content-of:a.txt');

      const history = await cli(dir, ['history']);
      assert.match(history.out, /applied\s+2 file/u);

      const undone = await cli(dir, ['undo', '--yes']);
      assert.equal(undone.code, EXIT.ok);
      assert.deepEqual(await listNames(dir), ['a.txt', 'b.txt']);

      const again = await cli(dir, ['undo', '--yes']);
      assert.match(again.out, /Nessuna rinomina da annullare/u);
    });
  });

  it('refuses to apply non-interactively without --yes', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['a.txt']);
      const { code, err } = await cli(dir, ['.', '--name', 'X', '--apply']);
      assert.equal(code, EXIT.usage);
      assert.match(err, /--yes/u);
      assert.deepEqual(await listNames(dir), ['a.txt']);
    });
  });

  it('asks for confirmation in a terminal', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['a.txt']);
      const no = await cli(dir, ['.', '--name', 'X', '--apply'], fakeIo({ cwd: dir, isTTY: true, answer: false }));
      assert.equal(no.code, EXIT.ok);
      assert.deepEqual(await listNames(dir), ['a.txt']);
      const yes = await cli(dir, ['.', '--name', 'X', '--apply'], fakeIo({ cwd: dir, isTTY: true, answer: true }));
      assert.equal(yes.code, EXIT.ok);
      assert.deepEqual(await listNames(dir), ['X_1.txt']);
    });
  });

  it('reports "nothing to do" when names are already right', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['a.txt']);
      const { code, out } = await cli(dir, ['.', '--rule', '{"type":"case","mode":"lower"}', '--apply', '--yes']);
      assert.equal(code, EXIT.ok);
      assert.match(out, /Nessun file da rinominare/u);
    });
  });
});

describe('CLI: rules mode', () => {
  it('combines --rule flags with numbering options', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['IMG_One Two.JPG']);
      const { code } = await cli(dir, [
        '.',
        '--rule', '{"type":"replace","find":"IMG_","with":"Trip "}',
        '--rule', '{"type":"separators","spaces":"underscore"}',
        '--rule', '{"type":"case","mode":"lower"}',
        '--delimiter', '-', '--digits', '2',
        '--apply', '--yes',
      ]);
      assert.equal(code, EXIT.ok);
      assert.deepEqual(await listNames(dir), ['trip_one_two-01.JPG']);
    });
  });
});

describe('CLI: conflicts and invalid plans', () => {
  it('exits with code 3 and changes nothing when the plan is blocked', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['a1.txt', 'a2.txt']);
      const { code, err, out } = await cli(dir, ['.', '--rule', '{"type":"removeChars","digits":true}', '--apply', '--yes']);
      assert.equal(code, EXIT.blocked);
      assert.match(out, /stesso nome/u);
      assert.match(err, /Piano bloccato/u);
      assert.deepEqual(await listNames(dir), ['a1.txt', 'a2.txt']);
    });
  });

  it('blocks a name that already exists in the folder', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['a.txt', 'X_1.txt']);
      const { code } = await cli(dir, ['.', '--name', 'X', '--include', 'a.*', '--apply', '--yes']);
      assert.equal(code, EXIT.blocked);
      assert.deepEqual(await listNames(dir), ['X_1.txt', 'a.txt']);
    });
  });
});

describe('CLI: presets and filters', () => {
  it('uses a preset file; flags override its filters', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['a.jpg', 'b.png']);
      const preset = path.join(dir, '..', `${path.basename(dir)}-preset.json`);
      await writeFile(preset, JSON.stringify({ mode: 'free', free: { name: 'P' }, filters: { extensions: ['jpg'] } }));
      const fromPreset = await cli(dir, ['.', '--preset', preset, '--json']);
      assert.equal(JSON.parse(fromPreset.out).summary.total, 1);
      const overridden = await cli(dir, ['.', '--preset', preset, '--ext', 'png', '--json']);
      assert.equal(JSON.parse(overridden.out).items[0].newName, 'P_1.png');
    });
  });

  it('--json prints a machine-readable plan', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['a.txt']);
      const { out } = await cli(dir, ['.', '--name', 'J', '--json']);
      const plan = JSON.parse(out);
      assert.equal(plan.hasBlockingIssues, false);
      assert.equal(plan.items[0].oldName, 'a.txt');
      assert.equal(plan.items[0].newName, 'J_1.txt');
    });
  });

  it('validates preset files', async () => {
    await withTempDir(async (dir) => {
      const good = path.join(dir, 'good.json');
      const bad = path.join(dir, 'bad.json');
      await writeFile(good, JSON.stringify({ mode: 'free', free: { name: 'x' } }));
      await writeFile(bad, JSON.stringify({ mode: 'free', free: { name: 'a/b' } }));
      assert.equal((await cli(dir, ['validate', good])).code, EXIT.ok);
      const invalid = await cli(dir, ['validate', bad]);
      assert.equal(invalid.code, EXIT.usage);
      assert.match(invalid.err, /Preset non valido/u);
    });
  });

  it('recursive and per-folder numbering', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['a.txt', 'sub/b.txt', 'sub/c.txt']);
      const { code } = await cli(dir, ['.', '--name', 'N', '-r', '--scope', 'perFolder', '--apply', '--yes']);
      assert.equal(code, EXIT.ok);
      assert.deepEqual(await listNames(dir), ['N_1.txt', 'sub']);
      assert.deepEqual(await listNames(path.join(dir, 'sub')), ['N_1.txt', 'N_2.txt']);
    });
  });
});

describe('CLI: usage errors (exit code 2)', () => {
  const failing: Array<[string, string[]]> = [
    ['unknown option', ['.', '--nope']],
    ['no mode at all', ['.']],
    ['--preset with --name', ['.', '--preset', 'p.json', '--name', 'x']],
    ['--name with --rule', ['.', '--name', 'x', '--rule', '{"type":"accents"}']],
    ['invalid --rule JSON', ['.', '--rule', '{oops']],
    ['non-numeric --start', ['.', '--name', 'x', '--start', 'abc']],
    ['invalid --digits', ['.', '--name', 'x', '--digits', '0']],
    ['unsafe name', ['.', '--name', '../evil']],
    ['two directories', ['a', 'b', '--name', 'x']],
    ['validate without file', ['validate']],
    ['undo with extras', ['undo', 'x']],
  ];
  for (const [label, args] of failing) {
    it(label, async () => {
      await withTempDir(async (dir) => {
        await makeFiles(dir, ['a.txt']);
        const { code, err } = await cli(dir, args);
        assert.equal(code, EXIT.usage, err);
        assert.deepEqual(await listNames(dir), ['a.txt']);
      });
    });
  }

  it('missing folder is a runtime error (exit code 1)', async () => {
    await withTempDir(async (dir) => {
      const { code, err } = await cli(dir, ['./missing', '--name', 'x']);
      assert.equal(code, EXIT.error);
      assert.match(err, /non trovata/u);
    });
  });
});

describe('CLI: misc', () => {
  it('prints help and version', async () => {
    await withTempDir(async (dir) => {
      const help = await cli(dir, ['--help']);
      assert.match(help.out, /USO/u);
      assert.equal((await cli(dir, [])).code, EXIT.ok);
      assert.equal((await cli(dir, ['--version'])).out.trim(), VERSION);
    });
  });

  it('VERSION matches package.json', async () => {
    const pkg = JSON.parse(await readFile(path.join(process.cwd(), 'package.json'), 'utf8')) as { version: string };
    assert.equal(pkg.version, VERSION);
  });

  it('parseCommandLine is pure and typed', () => {
    const parsed = parseCommandLine(['.', '--name', 'x', '--apply', '-y']);
    assert.equal(parsed.command, 'rename');
    assert.throws(() => parseCommandLine(['.', '--start']), UsageError);
  });

  it('does not use colors outside a terminal or with NO_COLOR', async () => {
    await withTempDir(async (dir) => {
      await makeFiles(dir, ['a.txt']);
      const plain = await cli(dir, ['.', '--name', 'x']);
      assert.equal(plain.out.includes('\u001b['), false);
      const noColor = await cli(dir, ['.', '--name', 'x'], fakeIo({ cwd: dir, isTTY: true, env: { NO_COLOR: '1' } }));
      assert.equal(noColor.out.includes('\u001b['), false);
    });
  });
});
