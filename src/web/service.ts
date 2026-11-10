import { createHash, randomBytes } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { PresetError, RenamerError } from '../core/errors.js';
import { naturalCompare } from '../core/natural-sort.js';
import { buildPlan } from '../core/planner.js';
import { DEFAULT_MAX_FILES, parsePreset, presetRequiresExif } from '../core/preset.js';
import type { FileEntry, Filters, RenamePlan } from '../core/types.js';
import { executePlan, undoLast } from '../fs/executor.js';
import { JournalStore } from '../fs/journal.js';
import { scanDirectory } from '../fs/scanner.js';
import type { ScanResult } from '../fs/scanner.js';
import { VERSION } from '../version.js';
import { HttpError, asObject, optionalBool, requireString, stringArray } from './http-utils.js';
import type {
  ApplyResponse,
  FolderListing,
  InfoResponse,
  PlanItemDto,
  PlanResponse,
  ScanFile,
  ScanResponse,
  Shortcut,
  UndoInfo,
  UndoResponse,
} from './shared/api-types.js';

export interface WebServiceOptions {
  /** Where the undo log lives. */
  readonly stateDir: string;
  readonly home?: string;
  readonly platform?: NodeJS.Platform;
  /** Maximum number of folder scans kept in memory. */
  readonly maxCachedScans?: number;
}

interface CachedScan {
  readonly id: string;
  readonly root: string;
  readonly filters: Filters;
  entries: FileEntry[];
  siblings: ScanResult['siblings'];
  exifLoaded: boolean;
}

const MAX_FOLDERS_LISTED = 5000;
const MAX_EXCLUDED = 200_000;
const EXTENSION_PATTERN = /^[a-z0-9_-]+(\.[a-z0-9_-]+)?$/u;

function toId(root: string, entry: Pick<FileEntry, 'dir' | 'base'>): string {
  return path.relative(root, path.join(entry.dir, entry.base)).split(path.sep).join('/');
}

function relativeDir(root: string, dir: string): string {
  return path.relative(root, dir).split(path.sep).join('/');
}

/** Application logic of the local UI. Independent of HTTP, so it is easy to test. */
export class WebService {
  private readonly scans = new Map<string, CachedScan>();
  private readonly journal: JournalStore;
  private readonly home: string;
  private readonly platform: NodeJS.Platform;
  private readonly maxScans: number;
  private busy = false;

  constructor(options: WebServiceOptions) {
    this.journal = new JournalStore(options.stateDir);
    this.home = options.home ?? homedir();
    this.platform = options.platform ?? process.platform;
    this.maxScans = options.maxCachedScans ?? 5;
  }

  // --- Informational endpoints -------------------------------------------

  async info(): Promise<InfoResponse> {
    return {
      version: VERSION,
      platform: this.platform,
      home: this.home,
      shortcuts: await this.shortcuts(),
      lastUndo: await this.undoInfo(),
    };
  }

  private async shortcuts(): Promise<Shortcut[]> {
    const candidates: Shortcut[] = [{ label: 'Home', path: this.home }];
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
    const result: Shortcut[] = [];
    for (const candidate of candidates) {
      if (await isDirectory(candidate.path)) result.push(candidate);
    }
    return result;
  }

  async folders(rawPath: string | undefined, showHidden: boolean): Promise<FolderListing> {
    const target = rawPath === undefined || rawPath === '' ? this.home : rawPath;
    if (!path.isAbsolute(target) || target.includes('\0')) {
      throw new HttpError(400, 'BAD_REQUEST', 'Indica un percorso assoluto.');
    }
    const resolved = path.resolve(target);
    let dirents;
    try {
      dirents = await readdir(resolved, { withFileTypes: true });
    } catch (error) {
      throw fsError(error, resolved);
    }

    const names: string[] = [];
    for (const dirent of dirents) {
      if (!showHidden && dirent.name.startsWith('.')) continue;
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

  // --- Scan ----------------------------------------------------------------

  async scan(body: unknown): Promise<ScanResponse> {
    const req = asObject(body);
    const requested = requireString(req, 'path');
    if (!path.isAbsolute(requested)) {
      throw new HttpError(400, 'BAD_REQUEST', 'Indica un percorso assoluto.');
    }
    const recursive = optionalBool(req, 'recursive', false);
    const filters: Filters = {
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
    const cached: CachedScan = {
      id: randomBytes(9).toString('base64url'),
      root: scan.root,
      filters,
      entries: scan.entries,
      siblings: scan.siblings,
      exifLoaded: false,
    };
    this.remember(cached);

    const files: ScanFile[] = [...scan.entries]
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

  private remember(scan: CachedScan): void {
    this.scans.set(scan.id, scan);
    while (this.scans.size > this.maxScans) {
      const oldest = this.scans.keys().next().value;
      if (oldest === undefined) break;
      this.scans.delete(oldest);
    }
  }

  private cachedScan(id: string): CachedScan {
    const scan = this.scans.get(id);
    if (!scan) {
      throw new HttpError(410, 'SCAN_EXPIRED', 'L\'elenco dei file non è più disponibile: ricarica la cartella.');
    }
    return scan;
  }

  // --- Plan ----------------------------------------------------------------

  async plan(body: unknown): Promise<PlanResponse> {
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

  // --- Apply ---------------------------------------------------------------

  async apply(body: unknown): Promise<ApplyResponse> {
    const request = parsePlanRequest(body);
    const expected = requireString(request.raw, 'expectedPlanId', 128);
    const cached = this.cachedScan(request.scanId);
    const preset = parsePreset({ ...request.preset, filters: cached.filters });

    return this.exclusive(async () => {
      // Fresh look at the disk: the folder may have changed since the preview.
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

  // --- Undo ----------------------------------------------------------------

  async undoInfo(): Promise<UndoInfo | null> {
    const record = await this.journal.latestApplied();
    return record
      ? { runId: record.journal.runId, createdAt: record.journal.createdAt, count: record.journal.operations.length }
      : null;
  }

  async undo(body: unknown): Promise<UndoResponse> {
    const runId = requireString(asObject(body), 'runId', 64);
    return this.exclusive(async () => {
      const latest = await this.undoInfo();
      if (!latest || latest.runId !== runId) {
        throw new HttpError(409, 'UNDO_MISMATCH', 'Questa rinomina non è più l\'ultima: non può essere annullata da qui.');
      }
      return undoLast(this.journal);
    });
  }

  /** Only one write operation at a time; a second one is refused, not queued. */
  private async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.busy) {
      throw new HttpError(409, 'BUSY', 'Un\'altra operazione è in corso.');
    }
    this.busy = true;
    try {
      return await operation();
    } finally {
      this.busy = false;
    }
  }
}

// --- Helpers ---------------------------------------------------------------

async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

function parseExtensions(values: readonly string[]): string[] {
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

interface ParsedPlanRequest {
  readonly raw: Record<string, unknown>;
  readonly scanId: string;
  readonly excluded: ReadonlySet<string>;
  readonly preset: Record<string, unknown>;
}

function parsePlanRequest(body: unknown): ParsedPlanRequest {
  const raw = asObject(body);
  return {
    raw,
    scanId: requireString(raw, 'scanId', 64),
    excluded: new Set(stringArray(raw, 'excluded', MAX_EXCLUDED, 4096)),
    preset: asObject(raw['preset'], 'configurazione'),
  };
}

function planFor(
  root: string,
  entries: readonly FileEntry[],
  siblings: ScanResult['siblings'],
  excluded: ReadonlySet<string>,
  preset: ReturnType<typeof parsePreset>,
): RenamePlan {
  const selected = entries.filter((entry) => !excluded.has(toId(root, entry)));
  return buildPlan(selected, preset, { siblings });
}

/** Fingerprint of what a plan would do: the confirmed preview must match the fresh one. */
export function computePlanId(plan: RenamePlan): string {
  const digest = createHash('sha256');
  for (const item of plan.items) {
    digest.update(`${item.sourcePath}\u0000${item.targetPath}\u0000${item.status}\u0001`);
  }
  return digest.digest('hex').slice(0, 32);
}

function toPlanResponse(root: string, plan: RenamePlan): PlanResponse {
  const items: PlanItemDto[] = plan.items.map((item) => ({
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

function fsError(error: unknown, target: string): HttpError {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'ENOENT') return new HttpError(404, 'NOT_FOUND', `Cartella non trovata: ${target}`);
  if (code === 'ENOTDIR') return new HttpError(400, 'NOT_A_FOLDER', `Non è una cartella: ${target}`);
  if (code === 'EACCES' || code === 'EPERM') {
    return new HttpError(
      403,
      'ACCESS_DENIED',
      `Accesso negato a ${target}. Su macOS concedi l'accesso al Terminale in Impostazioni di Sistema → Privacy e sicurezza.`,
    );
  }
  return new HttpError(500, 'INTERNAL', 'Impossibile leggere la cartella.');
}

/** Maps any error to the HTTP error shown to the user (details never leak). */
export function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (error instanceof PresetError) {
    return new HttpError(422, 'PRESET_INVALID', 'Le impostazioni non sono complete o non sono valide.', error.issues);
  }
  if (error instanceof RenamerError) {
    const status = error.code === 'SCAN_ROOT' ? 404 : error.code === 'SCAN_LIMIT' || error.code === 'PLAN_BLOCKED' ? 422 : 400;
    return new HttpError(status, error.code, error.message);
  }
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'EACCES' || code === 'EPERM' || code === 'ENOENT' || code === 'ENOTDIR') {
    return fsError(error, 'la cartella selezionata');
  }
  return new HttpError(500, 'INTERNAL', 'Errore imprevisto.');
}
