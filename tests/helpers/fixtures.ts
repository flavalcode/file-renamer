import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { splitFileName } from '../../src/core/filename.js';
import { parsePreset } from '../../src/core/preset.js';
import type { FileEntry, Preset, PlanItem, RenamePlan } from '../../src/core/types.js';
import type { CliIo } from '../../src/cli/run.js';

/** In-memory file entry (no disk access). */
export function entry(base: string, overrides: Partial<FileEntry> = {}): FileEntry {
  const { name, ext } = splitFileName(base);
  return {
    dir: path.resolve('/data/Album'),
    base,
    name,
    ext,
    size: 100,
    mtimeMs: new Date(2026, 10, 9, 8, 5, 3).getTime(),
    birthtimeMs: new Date(2025, 0, 2, 3, 4, 5).getTime(),
    exifDateMs: null,
    ...overrides,
  };
}

export function freePreset(free: Record<string, unknown>, filters?: Record<string, unknown>): Preset {
  return parsePreset({ version: 1, mode: 'free', free, ...(filters ? { filters } : {}) });
}

export function rulesPreset(
  rules: unknown[],
  sequence?: Record<string, unknown> | null,
  filters?: Record<string, unknown>,
): Preset {
  return parsePreset({
    version: 1,
    mode: 'rules',
    rules,
    sequence: sequence ?? null,
    ...(filters ? { filters } : {}),
  });
}

/** Runs `fn` inside a fresh temporary directory that is always removed afterwards. */
export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'renamer-test-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Creates files whose content is their own (relative) name, to detect mix-ups. */
export async function makeFiles(dir: string, names: readonly string[]): Promise<void> {
  for (const name of names) {
    const full = path.join(dir, name);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, `content-of:${name}`);
  }
}

export async function listNames(dir: string): Promise<string[]> {
  return (await readdir(dir)).sort();
}

export async function readText(file: string): Promise<string> {
  return readFile(file, 'utf8');
}

/** Hand-made plan, to exercise the executor with swaps, cycles and chains. */
export function manualPlan(dir: string, pairs: ReadonlyArray<readonly [string, string]>): RenamePlan {
  const items: PlanItem[] = pairs.map(([from, to]) => ({
    entry: entry(from, { dir }),
    sourcePath: path.join(dir, from),
    targetPath: path.join(dir, to),
    oldBase: from,
    newBase: to,
    sequence: null,
    status: 'rename',
    issues: [],
  }));
  return {
    items,
    summary: { total: items.length, toRename: items.length, unchanged: 0, blocked: 0, warnings: 0 },
    hasBlockingIssues: false,
  };
}

export interface FakeIo extends CliIo {
  readonly out: string[];
  readonly err: string[];
  readonly stdoutText: () => string;
  readonly stderrText: () => string;
}

export function fakeIo(options: { cwd: string; isTTY?: boolean; answer?: boolean; env?: NodeJS.ProcessEnv }): FakeIo {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    stdoutText: () => out.join(''),
    stderrText: () => err.join(''),
    stdout: (text) => void out.push(text),
    stderr: (text) => void err.push(text),
    isTTY: options.isTTY ?? false,
    env: options.env ?? {},
    cwd: options.cwd,
    confirm: async () => options.answer ?? false,
  };
}

/** Small deterministic PRNG (mulberry32) so "random" tests are reproducible. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tiny `fetch`-like helper that lets tests control the Host/Origin headers (fetch forbids it). */
export async function rawHttp(options: {
  port: number;
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: string | Buffer;
}): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; text: string }> {
  const { request } = await import('node:http');
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: '127.0.0.1',
        port: options.port,
        method: options.method ?? 'GET',
        path: options.path,
        headers: { host: `127.0.0.1:${options.port}`, ...options.headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }),
        );
      },
    );
    req.on('error', reject);
    req.end(options.body);
  });
}
