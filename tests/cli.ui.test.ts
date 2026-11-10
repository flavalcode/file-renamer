import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { parseCommandLine, UsageError } from '../src/cli/args.js';
import { browserCommand } from '../src/cli/open-browser.js';
import { EXIT, runCli } from '../src/cli/run.js';
import { fakeIo, withTempDir } from './helpers/fixtures.js';

describe('parseCommandLine: ui', () => {
  it('parses port and no-open', () => {
    const cmd = parseCommandLine(['ui', '--port', '4000', '--no-open']);
    assert.equal(cmd.command, 'ui');
    if (cmd.command === 'ui') {
      assert.equal(cmd.port, 4000);
      assert.equal(cmd.noOpen, true);
    }
    const defaults = parseCommandLine(['ui']);
    assert.ok(defaults.command === 'ui' && defaults.port === 0 && !defaults.noOpen);
  });
  it('rejects bad ports and extra arguments', () => {
    for (const args of [['ui', '--port', '70000'], ['ui', '--port', 'x'], ['ui', '--port', '1.5'], ['ui', 'extra']]) {
      assert.throws(() => parseCommandLine(args), UsageError, args.join(' '));
    }
  });
});

describe('browserCommand', () => {
  const url = 'http://127.0.0.1:4599/#t=abc_DEF-123';
  it('picks the right opener per platform', () => {
    assert.deepEqual(browserCommand(url, 'darwin'), { command: 'open', args: [url] });
    assert.deepEqual(browserCommand(url, 'win32'), { command: 'cmd', args: ['/c', 'start', '', url] });
    assert.deepEqual(browserCommand(url, 'linux'), { command: 'xdg-open', args: [url] });
  });
  it('refuses anything that is not our local address (no command injection)', () => {
    for (const bad of [
      'http://evil.example/', 'file:///etc/passwd', 'http://127.0.0.1:1/#t=a&calc', 'http://127.0.0.1:1/ & calc',
      'http://127.0.0.1:1/#t=a b', 'https://127.0.0.1:1/', 'javascript:alert(1)', '',
    ]) {
      assert.equal(browserCommand(bad, 'win32'), null, bad);
    }
  });
});

describe('runCli ui', () => {
  async function assets(dir: string): Promise<string> {
    const folder = path.join(dir, 'assets');
    await mkdir(folder, { recursive: true });
    await writeFile(path.join(folder, 'index.html'), '<title>x</title>');
    return folder;
  }

  it('starts the server, prints the link, opens the browser and stops on shutdown', async () => {
    await withTempDir(async (dir) => {
      const opened: string[] = [];
      let reachable = 0;
      const base = fakeIo({ cwd: dir });
      const io = {
        ...base,
        webAssetsDir: await assets(dir),
        openUrl: (url: string) => void opened.push(url),
        waitForShutdown: async () => {
          const url = /(http:\/\/127\.0\.0\.1:\d+)\/#t=([\w-]+)/u.exec(base.stdoutText());
          const page = await fetch(`${url?.[1]}/`);
          reachable = page.status;
          const unauthorized = await fetch(`${url?.[1]}/api/info`);
          assert.equal(unauthorized.status, 401);
          const authorized = await fetch(`${url?.[1]}/api/info`, { headers: { 'x-renamer-token': url?.[2] ?? '' } });
          assert.equal(authorized.status, 200);
        },
      };
      const code = await runCli(['ui', '--state-dir', path.join(dir, 'state')], io);
      assert.equal(code, EXIT.ok);
      assert.equal(reachable, 200);
      assert.equal(opened.length, 1);
      assert.match(opened[0] ?? '', /^http:\/\/127\.0\.0\.1:\d+\/#t=/u);
      assert.match(base.stdoutText(), /solo su questo computer/u);
    });
  });

  it('does not open a browser with --no-open', async () => {
    await withTempDir(async (dir) => {
      const opened: string[] = [];
      const io = { ...fakeIo({ cwd: dir }), webAssetsDir: await assets(dir), openUrl: (u: string) => void opened.push(u), waitForShutdown: async () => undefined };
      assert.equal(await runCli(['ui', '--no-open', '--state-dir', path.join(dir, 's')], io), EXIT.ok);
      assert.equal(opened.length, 0);
    });
  });

  it('explains how to build when the web assets are missing', async () => {
    await withTempDir(async (dir) => {
      const io = { ...fakeIo({ cwd: dir }), webAssetsDir: path.join(dir, 'nothing') };
      const code = await runCli(['ui'], io);
      assert.equal(code, EXIT.error);
      assert.match(io.stderrText(), /npm run build/u);
    });
  });

  it('reports a busy port', async () => {
    await withTempDir(async (dir) => {
      const { createServer } = await import('node:http');
      const blocker = createServer();
      await new Promise<void>((r) => blocker.listen(0, '127.0.0.1', r));
      const port = (blocker.address() as { port: number }).port;
      try {
        const io = { ...fakeIo({ cwd: dir }), webAssetsDir: await assets(dir) };
        const code = await runCli(['ui', '--port', String(port)], io);
        assert.equal(code, EXIT.error);
        assert.match(io.stderrText(), /già in uso/u);
      } finally {
        blocker.close();
      }
    });
  });
});
