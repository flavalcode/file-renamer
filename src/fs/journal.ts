import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { RenamerError } from '../core/errors.js';

/**
 * Undo log ("journal"). One JSON file per run, written BEFORE the first rename
 * (status `pending`) so a crash never leaves renames without a record.
 */

export type JournalStatus = 'pending' | 'applied' | 'rolled_back' | 'rollback_failed' | 'undone';

export interface JournalOperation {
  /** Absolute path before the rename. */
  readonly from: string;
  /** Absolute path after the rename. */
  readonly to: string;
}

export interface Journal {
  readonly version: 1;
  readonly runId: string;
  readonly createdAt: string;
  readonly status: JournalStatus;
  readonly operations: readonly JournalOperation[];
}

export interface JournalRecord {
  readonly file: string;
  readonly journal: Journal;
}

const STATUSES: readonly JournalStatus[] = ['pending', 'applied', 'rolled_back', 'rollback_failed', 'undone'];
const RUN_ID_PATTERN = /^[a-f0-9]{8}$/u;
const MAX_JOURNAL_OPERATIONS = 100_000;
export const DEFAULT_RETENTION = 20;

/** Per-user state folder: Application Support (macOS), %APPDATA% (Windows), XDG state (Linux). */
export function defaultStateDir(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string {
  const override = env['FILE_RENAMER_HOME'];
  if (override) {
    return path.resolve(override);
  }
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'file-renamer');
  }
  if (platform === 'win32') {
    return path.join(env['APPDATA'] ?? path.join(home, 'AppData', 'Roaming'), 'file-renamer');
  }
  return path.join(env['XDG_STATE_HOME'] ?? path.join(home, '.local', 'state'), 'file-renamer');
}

/**
 * Validates a journal read from disk. The file is treated as UNTRUSTED input:
 * undo performs renames driven by it, so a tampered file must not be able to
 * move files across folders.
 */
export function parseJournal(value: unknown): Journal {
  const fail = (reason: string): never => {
    throw new RenamerError('JOURNAL_INVALID', `Registro di annullamento non valido: ${reason}`);
  };
  if (typeof value !== 'object' || value === null) return fail('formato');
  const raw = value as Record<string, unknown>;
  if (raw['version'] !== 1) return fail('versione');
  if (typeof raw['runId'] !== 'string' || !RUN_ID_PATTERN.test(raw['runId'])) return fail('runId');
  if (typeof raw['createdAt'] !== 'string' || Number.isNaN(Date.parse(raw['createdAt']))) return fail('data');
  if (!STATUSES.includes(raw['status'] as JournalStatus)) return fail('stato');
  const operations = raw['operations'];
  if (!Array.isArray(operations) || operations.length > MAX_JOURNAL_OPERATIONS) return fail('operazioni');

  const parsed: JournalOperation[] = operations.map((op: unknown) => {
    const o = op as Record<string, unknown> | null;
    const from = o?.['from'];
    const to = o?.['to'];
    if (typeof from !== 'string' || typeof to !== 'string') return fail('operazione');
    const fromPath = from as string;
    const toPath = to as string;
    if (!path.isAbsolute(fromPath) || !path.isAbsolute(toPath) || fromPath.includes('\0') || toPath.includes('\0')) {
      return fail('percorso');
    }
    if (path.dirname(fromPath) !== path.dirname(toPath)) return fail('spostamento tra cartelle non ammesso');
    return { from: fromPath, to: toPath };
  });

  return {
    version: 1,
    runId: raw['runId'],
    createdAt: raw['createdAt'],
    status: raw['status'] as JournalStatus,
    operations: parsed,
  };
}

export class JournalStore {
  constructor(
    public readonly dir: string,
    private readonly retention: number = DEFAULT_RETENTION,
  ) {}

  static createRunId(): string {
    return randomBytes(4).toString('hex');
  }

  /** Writes a new journal with status `pending`. */
  async create(runId: string, operations: readonly JournalOperation[]): Promise<Journal> {
    const journal: Journal = {
      version: 1,
      runId,
      createdAt: new Date().toISOString(),
      status: 'pending',
      operations,
    };
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    await this.write(this.fileFor(journal), journal);
    await this.prune();
    return journal;
  }

  async setStatus(runId: string, status: JournalStatus): Promise<void> {
    const record = (await this.list()).find((r) => r.journal.runId === runId);
    if (!record) {
      throw new RenamerError('JOURNAL_NOT_FOUND', `Registro ${runId} non trovato.`);
    }
    await this.write(record.file, { ...record.journal, status });
  }

  /** All readable journals, newest first. Corrupt files are ignored. */
  async list(): Promise<JournalRecord[]> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch {
      return [];
    }
    const records: JournalRecord[] = [];
    for (const name of names.filter((n) => n.endsWith('.json')).sort().reverse()) {
      const file = path.join(this.dir, name);
      try {
        records.push({ file, journal: parseJournal(JSON.parse(await readFile(file, 'utf8'))) });
      } catch {
        // Unreadable or tampered journal: skipped on purpose.
      }
    }
    return records;
  }

  async latestApplied(): Promise<JournalRecord | null> {
    return (await this.list()).find((r) => r.journal.status === 'applied') ?? null;
  }

  private fileFor(journal: Journal): string {
    const stamp = journal.createdAt.replace(/[:.]/gu, '-');
    return path.join(this.dir, `${stamp}-${journal.runId}.json`);
  }

  /** Atomic write (temp file + rename) with owner-only permissions. */
  private async write(file: string, journal: Journal): Promise<void> {
    const temp = `${file}.tmp`;
    await writeFile(temp, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
    await chmod(temp, 0o600).catch(() => undefined);
    await rename(temp, file);
  }

  private async prune(): Promise<void> {
    const records = await this.list();
    for (const old of records.slice(this.retention)) {
      await rm(old.file, { force: true });
    }
  }
}
