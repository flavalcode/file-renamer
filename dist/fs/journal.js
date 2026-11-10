import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { RenamerError } from '../core/errors.js';
const STATUSES = ['pending', 'applied', 'rolled_back', 'rollback_failed', 'undone'];
const RUN_ID_PATTERN = /^[a-f0-9]{8}$/u;
const MAX_JOURNAL_OPERATIONS = 100_000;
export const DEFAULT_RETENTION = 20;
export function defaultStateDir(env = process.env, platform = process.platform, home = homedir()) {
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
export function parseJournal(value) {
    const fail = (reason) => {
        throw new RenamerError('JOURNAL_INVALID', `Registro di annullamento non valido: ${reason}`);
    };
    if (typeof value !== 'object' || value === null)
        return fail('formato');
    const raw = value;
    if (raw['version'] !== 1)
        return fail('versione');
    if (typeof raw['runId'] !== 'string' || !RUN_ID_PATTERN.test(raw['runId']))
        return fail('runId');
    if (typeof raw['createdAt'] !== 'string' || Number.isNaN(Date.parse(raw['createdAt'])))
        return fail('data');
    if (!STATUSES.includes(raw['status']))
        return fail('stato');
    const operations = raw['operations'];
    if (!Array.isArray(operations) || operations.length > MAX_JOURNAL_OPERATIONS)
        return fail('operazioni');
    const parsed = operations.map((op) => {
        const o = op;
        const from = o?.['from'];
        const to = o?.['to'];
        if (typeof from !== 'string' || typeof to !== 'string')
            return fail('operazione');
        const fromPath = from;
        const toPath = to;
        if (!path.isAbsolute(fromPath) || !path.isAbsolute(toPath) || fromPath.includes('\0') || toPath.includes('\0')) {
            return fail('percorso');
        }
        if (path.dirname(fromPath) !== path.dirname(toPath))
            return fail('spostamento tra cartelle non ammesso');
        return { from: fromPath, to: toPath };
    });
    return {
        version: 1,
        runId: raw['runId'],
        createdAt: raw['createdAt'],
        status: raw['status'],
        operations: parsed,
    };
}
export class JournalStore {
    dir;
    retention;
    constructor(dir, retention = DEFAULT_RETENTION) {
        this.dir = dir;
        this.retention = retention;
    }
    static createRunId() {
        return randomBytes(4).toString('hex');
    }
    async create(runId, operations) {
        const journal = {
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
    async setStatus(runId, status) {
        const record = (await this.list()).find((r) => r.journal.runId === runId);
        if (!record) {
            throw new RenamerError('JOURNAL_NOT_FOUND', `Registro ${runId} non trovato.`);
        }
        await this.write(record.file, { ...record.journal, status });
    }
    async list() {
        let names;
        try {
            names = await readdir(this.dir);
        }
        catch {
            return [];
        }
        const records = [];
        for (const name of names.filter((n) => n.endsWith('.json')).sort().reverse()) {
            const file = path.join(this.dir, name);
            try {
                records.push({ file, journal: parseJournal(JSON.parse(await readFile(file, 'utf8'))) });
            }
            catch {
            }
        }
        return records;
    }
    async latestApplied() {
        return (await this.list()).find((r) => r.journal.status === 'applied') ?? null;
    }
    fileFor(journal) {
        const stamp = journal.createdAt.replace(/[:.]/gu, '-');
        return path.join(this.dir, `${stamp}-${journal.runId}.json`);
    }
    async write(file, journal) {
        const temp = `${file}.tmp`;
        await writeFile(temp, `${JSON.stringify(journal, null, 2)}\n`, { mode: 0o600 });
        await chmod(temp, 0o600).catch(() => undefined);
        await rename(temp, file);
    }
    async prune() {
        const records = await this.list();
        for (const old of records.slice(this.retention)) {
            await rm(old.file, { force: true });
        }
    }
}
