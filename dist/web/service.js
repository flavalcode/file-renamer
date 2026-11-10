import { createHash, randomBytes } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { PresetError, RenamerError } from '../core/errors.js';
import { naturalCompare } from '../core/natural-sort.js';
import { buildPlan } from '../core/planner.js';
import { DEFAULT_MAX_FILES, parsePreset, presetRequiresExif } from '../core/preset.js';
import { executePlan, undoLast } from '../fs/executor.js';
import { JournalStore } from '../fs/journal.js';
import { scanDirectory } from '../fs/scanner.js';
import { VERSION } from '../version.js';
import { HttpError, asObject, optionalBool, requireString, stringArray } from './http-utils.js';
const MAX_FOLDERS_LISTED = 5000;
const MAX_EXCLUDED = 200_000;
const EXTENSION_PATTERN = /^[a-z0-9_-]+(\.[a-z0-9_-]+)?$/u;
function toId(root, entry) {
    return path.relative(root, path.join(entry.dir, entry.base)).split(path.sep).join('/');
}
function relativeDir(root, dir) {
    return path.relative(root, dir).split(path.sep).join('/');
}
export class WebService {
    scans = new Map();
    journal;
    home;
    platform;
    maxScans;
    busy = false;
    constructor(options) {
        this.journal = new JournalStore(options.stateDir);
        this.home = options.home ?? homedir();
        this.platform = options.platform ?? process.platform;
        this.maxScans = options.maxCachedScans ?? 5;
    }
    async info() {
        return {
            version: VERSION,
            platform: this.platform,
            home: this.home,
            shortcuts: await this.shortcuts(),
            lastUndo: await this.undoInfo(),
        };
    }
    async shortcuts() {
        const candidates = [{ label: 'Home', path: this.home }];
        for (const name of ['Desktop', 'Documents', 'Downloads', 'Pictures']) {
            candidates.push({ label: name, path: path.join(this.home, name) });
        }
        if (this.platform === 'darwin') {
            candidates.push({ label: 'Volumes', path: '/Volumes' });
        }
        if (this.platform === 'win32') {
            for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
                candidates.push({ label: `${letter}:`, path: `${letter}:\\` });
            }
        }
        const result = [];
        for (const candidate of candidates) {
            if (await isDirectory(candidate.path))
                result.push(candidate);
        }
        return result;
    }
    async folders(rawPath, showHidden) {
        const target = rawPath === undefined || rawPath === '' ? this.home : rawPath;
        if (!path.isAbsolute(target) || target.includes('\0')) {
            throw new HttpError(400, 'BAD_REQUEST', 'Indica un percorso assoluto.');
        }
        const resolved = path.resolve(target);
        let dirents;
        try {
            dirents = await readdir(resolved, { withFileTypes: true });
        }
        catch (error) {
            throw fsError(error, resolved);
        }
        const names = [];
        for (const dirent of dirents) {
            if (!showHidden && dirent.name.startsWith('.'))
                continue;
            if (dirent.isDirectory() || (dirent.isSymbolicLink() && (await isDirectory(path.join(resolved, dirent.name))))) {
                names.push(dirent.name);
            }
        }
        names.sort(naturalCompare);
        const parent = path.dirname(resolved);
        return {
            path: resolved,
            parent: parent === resolved ? null : parent,
            folders: names.slice(0, MAX_FOLDERS_LISTED),
            truncated: names.length > MAX_FOLDERS_LISTED,
        };
    }
    async scan(body) {
        const req = asObject(body);
        const requested = requireString(req, 'path');
        if (!path.isAbsolute(requested)) {
            throw new HttpError(400, 'BAD_REQUEST', 'Indica un percorso assoluto.');
        }
        const recursive = optionalBool(req, 'recursive', false);
        const filters = {
            extensions: parseExtensions(stringArray(req, 'extensions', 50, 32)),
            include: [],
            exclude: [],
            recursive,
            includeHidden: optionalBool(req, 'includeHidden', false),
            maxFiles: DEFAULT_MAX_FILES,
        };
        const resolved = path.resolve(requested);
        if (recursive && path.parse(resolved).root === resolved) {
            throw new HttpError(400, 'ROOT_RECURSIVE', 'Non è possibile includere le sottocartelle partendo dalla radice del disco.');
        }
        const scan = await scanDirectory(resolved, { filters });
        const cached = {
            id: randomBytes(9).toString('base64url'),
            root: scan.root,
            filters,
            entries: scan.entries,
            siblings: scan.siblings,
            exifLoaded: false,
        };
        this.remember(cached);
        const files = [...scan.entries]
            .sort((a, b) => naturalCompare(relativeDir(scan.root, a.dir), relativeDir(scan.root, b.dir)) || naturalCompare(a.base, b.base))
            .map((entry) => ({
            id: toId(scan.root, entry),
            dir: relativeDir(scan.root, entry.dir),
            name: entry.base,
            size: entry.size,
            mtimeMs: entry.mtimeMs,
        }));
        return { scanId: cached.id, root: scan.root, files, skipped: scan.skipped };
    }
    remember(scan) {
        this.scans.set(scan.id, scan);
        while (this.scans.size > this.maxScans) {
            const oldest = this.scans.keys().next().value;
            if (oldest === undefined)
                break;
            this.scans.delete(oldest);
        }
    }
    cachedScan(id) {
        const scan = this.scans.get(id);
        if (!scan) {
            throw new HttpError(410, 'SCAN_EXPIRED', 'L\'elenco dei file non è più disponibile: ricarica la cartella.');
        }
        return scan;
    }
    async plan(body) {
        const request = parsePlanRequest(body);
        const cached = this.cachedScan(request.scanId);
        const preset = parsePreset({ ...request.preset, filters: cached.filters });
        if (presetRequiresExif(preset) && !cached.exifLoaded) {
            const fresh = await scanDirectory(cached.root, { filters: cached.filters, loadExif: true });
            cached.entries = fresh.entries;
            cached.siblings = fresh.siblings;
            cached.exifLoaded = true;
        }
        const plan = planFor(cached.root, cached.entries, cached.siblings, request.excluded, preset);
        return toPlanResponse(cached.root, plan);
    }
    async apply(body) {
        const request = parsePlanRequest(body);
        const expected = requireString(request.raw, 'expectedPlanId', 128);
        const cached = this.cachedScan(request.scanId);
        const preset = parsePreset({ ...request.preset, filters: cached.filters });
        return this.exclusive(async () => {
            const fresh = await scanDirectory(cached.root, { filters: cached.filters, loadExif: presetRequiresExif(preset) });
            const plan = planFor(cached.root, fresh.entries, fresh.siblings, request.excluded, preset);
            if (computePlanId(plan) !== expected) {
                throw new HttpError(409, 'PLAN_CHANGED', 'La cartella è cambiata dopo l\'anteprima. Aggiorna l\'anteprima e riprova.');
            }
            if (plan.hasBlockingIssues) {
                throw new HttpError(422, 'PLAN_BLOCKED', 'L\'anteprima contiene errori o conflitti: correggili prima di procedere.');
            }
            const result = await executePlan(plan, { journal: this.journal });
            this.scans.delete(cached.id);
            return result;
        });
    }
    async undoInfo() {
        const record = await this.journal.latestApplied();
        return record
            ? { runId: record.journal.runId, createdAt: record.journal.createdAt, count: record.journal.operations.length }
            : null;
    }
    async undo(body) {
        const runId = requireString(asObject(body), 'runId', 64);
        return this.exclusive(async () => {
            const latest = await this.undoInfo();
            if (!latest || latest.runId !== runId) {
                throw new HttpError(409, 'UNDO_MISMATCH', 'Questa rinomina non è più l\'ultima: non può essere annullata da qui.');
            }
            return undoLast(this.journal);
        });
    }
    async exclusive(operation) {
        if (this.busy) {
            throw new HttpError(409, 'BUSY', 'Un\'altra operazione è in corso.');
        }
        this.busy = true;
        try {
            return await operation();
        }
        finally {
            this.busy = false;
        }
    }
}
async function isDirectory(target) {
    try {
        return (await stat(target)).isDirectory();
    }
    catch {
        return false;
    }
}
function parseExtensions(values) {
    return values
        .map((value) => value.trim().replace(/^\./u, '').toLowerCase())
        .filter((value) => value.length > 0)
        .map((value) => {
        if (!EXTENSION_PATTERN.test(value) || value.length > 16) {
            throw new HttpError(400, 'BAD_REQUEST', `Estensione non valida: "${value}".`);
        }
        return value;
    });
}
function parsePlanRequest(body) {
    const raw = asObject(body);
    return {
        raw,
        scanId: requireString(raw, 'scanId', 64),
        excluded: new Set(stringArray(raw, 'excluded', MAX_EXCLUDED, 4096)),
        preset: asObject(raw['preset'], 'configurazione'),
    };
}
function planFor(root, entries, siblings, excluded, preset) {
    const selected = entries.filter((entry) => !excluded.has(toId(root, entry)));
    return buildPlan(selected, preset, { siblings });
}
export function computePlanId(plan) {
    const digest = createHash('sha256');
    for (const item of plan.items) {
        digest.update(`${item.sourcePath}\u0000${item.targetPath}\u0000${item.status}\u0001`);
    }
    return digest.digest('hex').slice(0, 32);
}
function toPlanResponse(root, plan) {
    const items = plan.items.map((item) => ({
        id: toId(root, item.entry),
        dir: relativeDir(root, item.entry.dir),
        oldName: item.oldBase,
        newName: item.newBase,
        status: item.status,
        sequence: item.sequence,
        issues: item.issues.map(({ severity, code, message }) => ({ severity, code, message })),
    }));
    return {
        planId: computePlanId(plan),
        root,
        summary: plan.summary,
        hasBlockingIssues: plan.hasBlockingIssues,
        items,
    };
}
function fsError(error, target) {
    const code = error.code;
    if (code === 'ENOENT')
        return new HttpError(404, 'NOT_FOUND', `Cartella non trovata: ${target}`);
    if (code === 'ENOTDIR')
        return new HttpError(400, 'NOT_A_FOLDER', `Non è una cartella: ${target}`);
    if (code === 'EACCES' || code === 'EPERM') {
        return new HttpError(403, 'ACCESS_DENIED', `Accesso negato a ${target}. Su macOS concedi l'accesso al Terminale in Impostazioni di Sistema → Privacy e sicurezza.`);
    }
    return new HttpError(500, 'INTERNAL', 'Impossibile leggere la cartella.');
}
export function toHttpError(error) {
    if (error instanceof HttpError)
        return error;
    if (error instanceof PresetError) {
        return new HttpError(422, 'PRESET_INVALID', 'Le impostazioni non sono complete o non sono valide.', error.issues);
    }
    if (error instanceof RenamerError) {
        const status = error.code === 'SCAN_ROOT' ? 404 : error.code === 'SCAN_LIMIT' || error.code === 'PLAN_BLOCKED' ? 422 : 400;
        return new HttpError(status, error.code, error.message);
    }
    const code = error?.code;
    if (code === 'EACCES' || code === 'EPERM' || code === 'ENOENT' || code === 'ENOTDIR') {
        return fsError(error, 'la cartella selezionata');
    }
    return new HttpError(500, 'INTERNAL', 'Errore imprevisto.');
}
