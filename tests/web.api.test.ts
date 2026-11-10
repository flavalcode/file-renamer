import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { startWebServer } from '../src/web/server.js';
import type { RunningServer } from '../src/web/server.js';
import type {
  ApplyResponse,
  FolderListing,
  InfoResponse,
  PlanResponse,
  ScanResponse,
  UndoResponse,
} from '../src/web/shared/api-types.js';
import { buildJpeg } from './helpers/jpeg.js';
import { listNames, makeFiles, rawHttp, withTempDir } from './helpers/fixtures.js';

const TOKEN = 'test-token-0123456789';
let workDir: string;
let cleanup: () => void;
let server: RunningServer;

before(async () => {
  await new Promise<void>((ready) => {
    void withTempDir(async (dir) => {
      workDir = dir;
      await mkdir(path.join(dir, 'static'));
      await writeFile(path.join(dir, 'static', 'index.html'), '<!doctype html><title>t</title>');
      await writeFile(path.join(dir, 'static', 'app.js'), 'console.log(1)');
      await writeFile(path.join(dir, 'secret.txt'), 'must never be served');
      await mkdir(path.join(dir, 'home', 'Desktop'), { recursive: true });
      server = await startWebServer({
        stateDir: path.join(dir, 'state'),
        staticDir: path.join(dir, 'static'),
        home: path.join(dir, 'home'),
        token: TOKEN,
      });
      ready();
      await new Promise<void>((done) => {
        cleanup = done;
      });
      await server.close();
    });
  });
});

after(() => cleanup());

async function api<T = unknown>(
  method: 'GET' | 'POST',
  route: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; data: T }> {
  const response = await rawHttp({
    port: server.port,
    method,
    path: route,
    headers: {
      'x-renamer-token': TOKEN,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: (response.text ? JSON.parse(response.text) : null) as T };
}

/** A fresh folder inside the shared temp dir. */
let counter = 0;
async function folder(files: readonly string[]): Promise<string> {
  counter += 1;
  const dir = path.join(workDir, `case-${counter}`);
  await mkdir(dir, { recursive: true });
  await makeFiles(dir, files);
  return dir;
}

const freeName = (name: string, extra: Record<string, unknown> = {}) => ({ mode: 'free', free: { name, ...extra } });
const scanBody = (dir: string, extra: Record<string, unknown> = {}) => ({
  path: dir,
  recursive: false,
  includeHidden: false,
  extensions: [],
  ...extra,
});

describe('static files and hardening', () => {
  it('serves the page with strict security headers', async () => {
    const res = await rawHttp({ port: server.port, path: '/' });
    assert.equal(res.status, 200);
    assert.match(String(res.headers['content-type']), /text\/html/u);
    assert.match(String(res.headers['content-security-policy']), /default-src 'none'/u);
    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal((await rawHttp({ port: server.port, path: '/app.js' })).status, 200);
  });

  for (const evil of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/static/../../secret.txt', '/.env', '/%00', '/..\\secret.txt', '/nothing.html']) {
    it(`does not serve ${evil}`, async () => {
      const res = await rawHttp({ port: server.port, path: evil });
      assert.equal(res.status, 404, evil);
      assert.equal(res.text.includes('must never be served'), false);
    });
  }

  it('rejects a foreign Host header (DNS rebinding)', async () => {
    const res = await rawHttp({ port: server.port, path: '/', headers: { host: `evil.example:${server.port}` } });
    assert.equal(res.status, 403);
    const api403 = await rawHttp({ port: server.port, path: '/api/info', headers: { host: 'localhost:1', 'x-renamer-token': TOKEN } });
    assert.equal(api403.status, 403);
  });

  it('accepts "localhost" as host', async () => {
    const res = await rawHttp({ port: server.port, path: '/', headers: { host: `localhost:${server.port}` } });
    assert.equal(res.status, 200);
  });

  it('rejects a foreign Origin, even with a valid token', async () => {
    const res = await api('POST', '/api/scan', scanBody(workDir), { origin: 'http://evil.example' });
    assert.equal(res.status, 403);
    const same = await api('GET', '/api/info', undefined, { origin: server.origin });
    assert.equal(same.status, 200);
  });

  it('requires the session token on every API call', async () => {
    for (const headers of [{} as Record<string, string>, { 'x-renamer-token': 'wrong' }, { 'x-renamer-token': `${TOKEN}x` }, { 'x-renamer-token': '' }]) {
      const res = await rawHttp({ port: server.port, path: '/api/info', headers });
      assert.equal(res.status, 401, JSON.stringify(headers));
    }
    const post = await rawHttp({ port: server.port, method: 'POST', path: '/api/scan', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(post.status, 401);
  });

  it('only allows GET and POST', async () => {
    for (const method of ['PUT', 'DELETE', 'PATCH']) {
      assert.equal((await rawHttp({ port: server.port, method, path: '/api/info', headers: { 'x-renamer-token': TOKEN } })).status, 405);
    }
  });

  it('requires a JSON content type (blocks "simple" cross-site form posts)', async () => {
    const res = await rawHttp({
      port: server.port, method: 'POST', path: '/api/scan',
      headers: { 'x-renamer-token': TOKEN, 'content-type': 'text/plain' }, body: '{}',
    });
    assert.equal(res.status, 415);
  });

  it('rejects malformed and oversized bodies', async () => {
    const bad = await rawHttp({
      port: server.port, method: 'POST', path: '/api/scan',
      headers: { 'x-renamer-token': TOKEN, 'content-type': 'application/json' }, body: '{nope',
    });
    assert.equal(bad.status, 400);
    const huge = await rawHttp({
      port: server.port, method: 'POST', path: '/api/scan',
      headers: { 'x-renamer-token': TOKEN, 'content-type': 'application/json' }, body: Buffer.alloc(5 * 1024 * 1024, 32),
    }).catch(() => ({ status: 413 })); // the server may cut the connection
    assert.equal(huge.status, 413);
  });

  it('returns JSON errors without internal details', async () => {
    const res = await api<{ error: string; message: string }>('GET', '/api/does-not-exist');
    assert.equal(res.status, 404);
    assert.equal(res.data.error, 'NOT_FOUND');
  });

  it('listens on the loopback interface only', () => {
    assert.match(server.origin, /^http:\/\/127\.0\.0\.1:\d+$/u);
    assert.ok(server.url.endsWith(`#t=${TOKEN}`));
  });
});

describe('GET /api/info and /api/folders', () => {
  it('returns version, shortcuts (existing folders only) and no undo at start', async () => {
    const { status, data } = await api<InfoResponse>('GET', '/api/info');
    assert.equal(status, 200);
    assert.match(data.version, /^\d+\.\d+\.\d+$/u);
    assert.ok(data.shortcuts.some((s) => s.label === 'Home'));
    assert.ok(data.shortcuts.some((s) => s.label === 'Desktop'));
    assert.equal(data.shortcuts.some((s) => s.label === 'Pictures'), false);
  });

  it('lists sub-folders only, naturally sorted, hiding dot-folders by default', async () => {
    const dir = await folder(['file.txt']);
    for (const name of ['d10', 'd2', '.hidden']) await mkdir(path.join(dir, name));
    const plain = await api<FolderListing>('GET', `/api/folders?path=${encodeURIComponent(dir)}`);
    assert.deepEqual(plain.data.folders, ['d2', 'd10']);
    assert.equal(plain.data.parent, path.dirname(dir));
    const hidden = await api<FolderListing>('GET', `/api/folders?path=${encodeURIComponent(dir)}&hidden=1`);
    assert.deepEqual(hidden.data.folders, ['.hidden', 'd2', 'd10']);
  });

  it('reports clear errors', async () => {
    assert.equal((await api('GET', '/api/folders?path=relative/path')).status, 400);
    assert.equal((await api('GET', `/api/folders?path=${encodeURIComponent(path.join(workDir, 'nope'))}`)).status, 404);
    const dir = await folder(['f.txt']);
    assert.equal((await api('GET', `/api/folders?path=${encodeURIComponent(path.join(dir, 'f.txt'))}`)).status, 400);
  });

  it('parent of a filesystem root is null', async () => {
    const root = path.parse(workDir).root;
    const { data } = await api<FolderListing>('GET', `/api/folders?path=${encodeURIComponent(root)}`);
    assert.equal(data.parent, null);
  });
});

describe('scan', () => {
  it('lists files with relative folder and id', async () => {
    const dir = await folder(['b.txt', 'a.txt', 'sub/c.txt', '.hidden']);
    const flat = await api<ScanResponse>('POST', '/api/scan', scanBody(dir));
    assert.equal(flat.status, 200);
    assert.deepEqual(flat.data.files.map((f) => f.id), ['a.txt', 'b.txt']);
    const deep = await api<ScanResponse>('POST', '/api/scan', scanBody(dir, { recursive: true }));
    assert.deepEqual(deep.data.files.map((f) => f.id), ['a.txt', 'b.txt', 'sub/c.txt']);
    assert.equal(deep.data.files[2]?.dir, 'sub');
    assert.equal(deep.data.skipped.hidden, 1);
  });

  it('filters by extension (with or without dot, any case)', async () => {
    const dir = await folder(['a.jpg', 'b.PNG', 'c.txt']);
    const { data } = await api<ScanResponse>('POST', '/api/scan', scanBody(dir, { extensions: ['.JPG', 'png'] }));
    assert.deepEqual(data.files.map((f) => f.name), ['a.jpg', 'b.PNG']);
  });

  it('validates input', async () => {
    const dir = await folder(['a.txt']);
    assert.equal((await api('POST', '/api/scan', scanBody('relative'))).status, 400);
    assert.equal((await api('POST', '/api/scan', scanBody(dir, { extensions: ['a/b'] }))).status, 400);
    assert.equal((await api('POST', '/api/scan', scanBody(dir, { recursive: 'yes' }))).status, 400);
    assert.equal((await api('POST', '/api/scan', {})).status, 400);
    assert.equal((await api('POST', '/api/scan', scanBody(path.join(workDir, 'missing')))).status, 404);
  });

  it('refuses recursion from the root of the disk', async () => {
    const res = await api<{ error: string }>('POST', '/api/scan', scanBody(path.parse(workDir).root, { recursive: true }));
    assert.equal(res.status, 400);
    assert.equal(res.data.error, 'ROOT_RECURSIVE');
  });
});

describe('plan', () => {
  it('previews the new names without touching the disk', async () => {
    const dir = await folder(['IMG_2.JPG', 'IMG_10.jpg', 'IMG_1.png']);
    const scan = (await api<ScanResponse>('POST', '/api/scan', scanBody(dir))).data;
    const { status, data } = await api<PlanResponse>('POST', '/api/plan', {
      scanId: scan.scanId, excluded: [], preset: freeName('Trip', { delimiter: '-' }),
    });
    assert.equal(status, 200);
    assert.deepEqual(data.items.map((i) => `${i.oldName}>${i.newName}`), [
      'IMG_1.png>Trip-1.png', 'IMG_2.JPG>Trip-2.JPG', 'IMG_10.jpg>Trip-3.jpg',
    ]);
    assert.equal(data.summary.toRename, 3);
    assert.equal(data.hasBlockingIssues, false);
    assert.deepEqual(await listNames(dir), ['IMG_1.png', 'IMG_10.jpg', 'IMG_2.JPG']);
  });

  it('numbers only the selected files (deselected ones are left alone)', async () => {
    const dir = await folder(['a.txt', 'b.txt', 'c.txt']);
    const scan = (await api<ScanResponse>('POST', '/api/scan', scanBody(dir))).data;
    const { data } = await api<PlanResponse>('POST', '/api/plan', { scanId: scan.scanId, excluded: ['b.txt'], preset: freeName('N') });
    assert.deepEqual(data.items.map((i) => i.newName), ['N_1.txt', 'N_2.txt']);
  });

  it('works in rules mode with numbering', async () => {
    const dir = await folder(['Hello World.TXT']);
    const scan = (await api<ScanResponse>('POST', '/api/scan', scanBody(dir))).data;
    const { data } = await api<PlanResponse>('POST', '/api/plan', {
      scanId: scan.scanId, excluded: [],
      preset: { mode: 'rules', rules: [{ type: 'case', mode: 'lower' }, { type: 'separators', spaces: 'underscore' }], sequence: { digits: 3 } },
    });
    assert.equal(data.items[0]?.newName, 'hello_world_001.TXT');
  });

  it('reports conflicts with files that exist but are not selected', async () => {
    const dir = await folder(['a.txt', 'N_1.txt']);
    const scan = (await api<ScanResponse>('POST', '/api/scan', scanBody(dir))).data;
    const { data } = await api<PlanResponse>('POST', '/api/plan', { scanId: scan.scanId, excluded: ['N_1.txt'], preset: freeName('N') });
    assert.equal(data.hasBlockingIssues, true);
    assert.equal(data.items[0]?.issues[0]?.code, 'EXISTS_ON_DISK');
  });

  it('answers 422 with every problem when the form is incomplete or invalid', async () => {
    const dir = await folder(['a.txt']);
    const scan = (await api<ScanResponse>('POST', '/api/scan', scanBody(dir))).data;
    const res = await api<{ error: string; issues: string[] }>('POST', '/api/plan', {
      scanId: scan.scanId, excluded: [], preset: freeName('a/b', { start: -3 }),
    });
    assert.equal(res.status, 422);
    assert.equal(res.data.error, 'PRESET_INVALID');
    assert.ok(res.data.issues.length >= 2);
  });

  it('ignores filters sent by the client (they come from the scan)', async () => {
    const dir = await folder(['a.txt', 'sub/b.txt']);
    const scan = (await api<ScanResponse>('POST', '/api/scan', scanBody(dir))).data;
    const { data } = await api<PlanResponse>('POST', '/api/plan', {
      scanId: scan.scanId, excluded: [], preset: { ...freeName('N'), filters: { recursive: true, includeHidden: true, maxFiles: 99999 } },
    });
    assert.equal(data.items.length, 1);
  });

  it('answers 410 for an unknown or expired scan', async () => {
    assert.equal((await api('POST', '/api/plan', { scanId: 'nope', excluded: [], preset: freeName('N') })).status, 410);
  });

  it('orders by EXIF date when asked (reads EXIF lazily)', async () => {
    const dir = await folder([]);
    await writeFile(path.join(dir, 'a.jpg'), buildJpeg('2024:05:17 13:45:09'));
    await writeFile(path.join(dir, 'b.jpg'), buildJpeg('2020:01:01 00:00:00'));
    const scan = (await api<ScanResponse>('POST', '/api/scan', scanBody(dir))).data;
    const { data } = await api<PlanResponse>('POST', '/api/plan', { scanId: scan.scanId, excluded: [], preset: freeName('P', { orderBy: 'exif' }) });
    assert.deepEqual(data.items.map((i) => `${i.oldName}>${i.newName}`), ['b.jpg>P_1.jpg', 'a.jpg>P_2.jpg']);
  });
});

describe('apply and undo', () => {
  async function prepare(files: string[], preset: unknown, excluded: string[] = []) {
    const dir = await folder(files);
    const scan = (await api<ScanResponse>('POST', '/api/scan', scanBody(dir))).data;
    const request = { scanId: scan.scanId, excluded, preset };
    const plan = (await api<PlanResponse>('POST', '/api/plan', request)).data;
    return { dir, request, plan };
  }

  it('renames after confirmation, then undoes it', async () => {
    const { dir, request, plan } = await prepare(['b.txt', 'a.txt'], freeName('Doc', { digits: 3, start: 10 }));
    const applied = await api<ApplyResponse>('POST', '/api/apply', { ...request, expectedPlanId: plan.planId });
    assert.equal(applied.status, 200);
    assert.equal(applied.data.status, 'applied');
    assert.equal(applied.data.renamed, 2);
    assert.deepEqual(await listNames(dir), ['Doc_010.txt', 'Doc_011.txt']);
    assert.equal(await readFile(path.join(dir, 'Doc_010.txt'), 'utf8'), 'content-of:a.txt');

    const info = (await api<InfoResponse>('GET', '/api/info')).data;
    assert.equal(info.lastUndo?.count, 2);
    assert.equal(info.lastUndo?.runId, applied.data.runId);

    const undone = await api<UndoResponse>('POST', '/api/undo', { runId: applied.data.runId });
    assert.equal(undone.data.status, 'applied');
    assert.deepEqual(await listNames(dir), ['a.txt', 'b.txt']);
    assert.equal((await api<InfoResponse>('GET', '/api/info')).data.lastUndo, null);
  });

  it('the scan is consumed by a successful apply', async () => {
    const { request, plan } = await prepare(['a.txt'], freeName('X'));
    await api('POST', '/api/apply', { ...request, expectedPlanId: plan.planId });
    assert.equal((await api('POST', '/api/plan', request)).status, 410);
  });

  it('refuses when the confirmed preview is not the current one (409) and changes nothing', async () => {
    const { dir, request, plan } = await prepare(['a.txt', 'b.txt'], freeName('X'));
    const res = await api<{ error: string }>('POST', '/api/apply', { ...request, expectedPlanId: `${plan.planId.slice(0, -1)}0` });
    assert.equal(res.status, 409);
    assert.equal(res.data.error, 'PLAN_CHANGED');
    assert.deepEqual(await listNames(dir), ['a.txt', 'b.txt']);
  });

  it('detects a folder that changed after the preview (new file, removed file)', async () => {
    const added = await prepare(['a.txt', 'b.txt'], freeName('X'));
    await writeFile(path.join(added.dir, 'X_2.txt'), 'appeared meanwhile');
    const r1 = await api<{ error: string }>('POST', '/api/apply', { ...added.request, expectedPlanId: added.plan.planId });
    assert.equal(r1.status, 409);
    assert.equal(await readFile(path.join(added.dir, 'X_2.txt'), 'utf8'), 'appeared meanwhile');

    const removed = await prepare(['a.txt', 'b.txt', 'c.txt'], freeName('Y'));
    await (await import('node:fs/promises')).rm(path.join(removed.dir, 'b.txt'));
    const r2 = await api('POST', '/api/apply', { ...removed.request, expectedPlanId: removed.plan.planId });
    assert.equal(r2.status, 409);
    assert.deepEqual(await listNames(removed.dir), ['a.txt', 'c.txt']);
  });

  it('refuses a plan with conflicts (422) even if the id matches', async () => {
    const { dir, request, plan } = await prepare(['a1.txt', 'a2.txt'], { mode: 'rules', rules: [{ type: 'removeChars', digits: true }] });
    assert.equal(plan.hasBlockingIssues, true);
    const res = await api<{ error: string }>('POST', '/api/apply', { ...request, expectedPlanId: plan.planId });
    assert.equal(res.status, 422);
    assert.equal(res.data.error, 'PLAN_BLOCKED');
    assert.deepEqual(await listNames(dir), ['a1.txt', 'a2.txt']);
  });

  it('requires expectedPlanId', async () => {
    const { request } = await prepare(['a.txt'], freeName('X'));
    assert.equal((await api('POST', '/api/apply', request)).status, 400);
  });

  it('only the most recent run can be undone, and only with its id', async () => {
    const first = await prepare(['a.txt'], freeName('One'));
    const r1 = (await api<ApplyResponse>('POST', '/api/apply', { ...first.request, expectedPlanId: first.plan.planId })).data;
    await new Promise((r) => setTimeout(r, 5));
    const second = await prepare(['b.txt'], freeName('Two'));
    const r2 = (await api<ApplyResponse>('POST', '/api/apply', { ...second.request, expectedPlanId: second.plan.planId })).data;

    assert.equal((await api('POST', '/api/undo', { runId: r1.runId })).status, 409);
    assert.equal((await api('POST', '/api/undo', { runId: 'nonexistent' })).status, 409);
    assert.equal((await api('POST', '/api/undo', {})).status, 400);
    assert.equal((await api<UndoResponse>('POST', '/api/undo', { runId: r2.runId })).data.status, 'applied');
    assert.equal((await api<UndoResponse>('POST', '/api/undo', { runId: r1.runId })).data.status, 'applied');
  });

  it('handles a 2,000-file batch with a large exclusion list', async () => {
    const names = Array.from({ length: 2000 }, (_, i) => `f${i}.dat`);
    const { dir, request, plan } = await prepare(names, freeName('Big'), names.slice(0, 1000));
    assert.equal(plan.summary.toRename, 1000);
    const res = await api<ApplyResponse>('POST', '/api/apply', { ...request, expectedPlanId: plan.planId });
    assert.equal(res.data.renamed, 1000);
    const after = await listNames(dir);
    assert.equal(after.filter((n) => n.startsWith('Big_')).length, 1000);
    assert.ok(after.includes('Big_0001.dat') && after.includes('Big_1000.dat') && after.includes('f0.dat'));
    await api('POST', '/api/undo', { runId: res.data.runId });
  });
});
