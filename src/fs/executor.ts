import path from 'node:path';
import { RenamerError, errorMessage } from '../core/errors.js';
import { collisionKey } from '../core/filename.js';
import type { RenamePlan } from '../core/types.js';
import { nodeFsPort } from './fs-port.js';
import type { FsPort } from './fs-port.js';
import { JournalStore } from './journal.js';
import type { JournalOperation } from './journal.js';

/**
 * Applies a plan to the disk.
 *
 * Strategy: TWO-PHASE rename. Phase 1 moves every file to a unique temporary
 * name in the same folder; phase 2 moves each one to its final name. This makes
 * name swaps (a<->b), cycles and case-only changes (`a.txt` -> `A.txt` on
 * case-insensitive file systems) work. Any failure triggers a rollback of
 * everything done so far.
 */

export type ExecutionStatus = 'applied' | 'rolled_back' | 'rollback_failed' | 'nothing_to_do';

export interface ExecutionResult {
  readonly status: ExecutionStatus;
  readonly runId: string | null;
  readonly renamed: number;
  /** Why the run failed (only when `status` is `rolled_back` / `rollback_failed`). */
  readonly failure?: string;
  /** Problems met while rolling back (only when `status` is `rollback_failed`). */
  readonly rollbackErrors: readonly string[];
  readonly warnings: readonly string[];
}

export interface ExecuteOptions {
  readonly fs?: FsPort;
  /** Undo log. Strongly recommended: without it the run cannot be undone. */
  readonly journal?: JournalStore;
  readonly onProgress?: (done: number, total: number) => void;
}

interface Move {
  readonly from: string;
  readonly to: string;
}

type TwoPhaseOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly failure: string; readonly rollbackErrors: string[] };

class PreflightError extends Error {}

function assertSafeOperations(operations: readonly JournalOperation[]): void {
  const sources = new Set<string>();
  const targets = new Set<string>();
  for (const { from, to } of operations) {
    if (!path.isAbsolute(from) || !path.isAbsolute(to)) {
      throw new RenamerError('UNSAFE_OPERATION', 'Percorso non assoluto.');
    }
    if (path.dirname(from) !== path.dirname(to)) {
      throw new RenamerError('UNSAFE_OPERATION', 'Un file può essere rinominato solo nella sua cartella.');
    }
    // Exact comparison on purpose: on a case-sensitive file system two names that
    // differ only by case are two real files (an undo must be able to restore them).
    // The planner already applies the stricter case-insensitive rule to NEW names,
    // and on case-insensitive file systems the "target must not exist" checks done
    // right before every move catch any collision (followed by a rollback).
    if (sources.has(from) || targets.has(to)) {
      throw new RenamerError('UNSAFE_OPERATION', 'Operazioni duplicate nel piano.');
    }
    sources.add(from);
    targets.add(to);
  }
}

async function preflight(operations: readonly JournalOperation[], port: FsPort): Promise<void> {
  const vacated = new Set(operations.map((op) => collisionKey(op.from)));
  for (const op of operations) {
    if ((await port.kind(op.from)) !== 'file') {
      throw new PreflightError(`Il file non esiste più o non è un file: ${op.from}`);
    }
    if ((await port.kind(op.to)) !== 'missing' && !vacated.has(collisionKey(op.to))) {
      throw new PreflightError(`La destinazione esiste già: ${op.to}`);
    }
  }
}

async function runTwoPhase(
  operations: readonly JournalOperation[],
  port: FsPort,
  runId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<TwoPhaseOutcome> {
  assertSafeOperations(operations);
  try {
    await preflight(operations, port);
  } catch (error) {
    if (error instanceof PreflightError) {
      return { ok: false, failure: error.message, rollbackErrors: [] };
    }
    return { ok: false, failure: errorMessage(error), rollbackErrors: [] };
  }

  const done: Move[] = [];
  const temps = operations.map((op, index) => path.join(path.dirname(op.from), `.renamer-${runId}-${index}.tmp`));
  const total = operations.length * 2;

  const move = async (from: string, to: string): Promise<void> => {
    await port.rename(from, to);
    done.push({ from, to });
    onProgress?.(done.length, total);
  };

  try {
    for (const [index, op] of operations.entries()) {
      const temp = temps[index] as string;
      if ((await port.kind(temp)) !== 'missing') {
        throw new Error(`Nome temporaneo già in uso: ${temp}`);
      }
      await move(op.from, temp);
    }
    for (const [index, op] of operations.entries()) {
      // Never overwrite: re-check right before the move (renames overwrite silently on POSIX/Windows).
      if ((await port.kind(op.to)) !== 'missing') {
        throw new Error(`La destinazione è apparsa durante l'operazione: ${op.to}`);
      }
      await move(temps[index] as string, op.to);
    }
    return { ok: true };
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const step of done.reverse()) {
      try {
        await port.rename(step.to, step.from);
      } catch (rollbackError) {
        rollbackErrors.push(`${step.to} -> ${step.from}: ${errorMessage(rollbackError)}`);
      }
    }
    return { ok: false, failure: errorMessage(error), rollbackErrors };
  }
}

function toResult(
  outcome: TwoPhaseOutcome,
  runId: string,
  count: number,
  warnings: string[],
): ExecutionResult {
  if (outcome.ok) {
    return { status: 'applied', runId, renamed: count, rollbackErrors: [], warnings };
  }
  return {
    status: outcome.rollbackErrors.length > 0 ? 'rollback_failed' : 'rolled_back',
    runId,
    renamed: 0,
    failure: outcome.failure,
    rollbackErrors: outcome.rollbackErrors,
    warnings,
  };
}

async function safeSetStatus(
  store: JournalStore | undefined,
  runId: string,
  status: Parameters<JournalStore['setStatus']>[1],
  warnings: string[],
): Promise<void> {
  if (!store) return;
  try {
    await store.setStatus(runId, status);
  } catch (error) {
    warnings.push(`Impossibile aggiornare il registro di annullamento: ${errorMessage(error)}`);
  }
}

/** Executes a plan. Throws if the plan has blocking issues; operational failures are returned. */
export async function executePlan(plan: RenamePlan, options: ExecuteOptions = {}): Promise<ExecutionResult> {
  if (plan.hasBlockingIssues) {
    throw new RenamerError('PLAN_BLOCKED', 'Il piano contiene errori o conflitti: non può essere eseguito.');
  }
  const operations: JournalOperation[] = plan.items
    .filter((item) => item.status === 'rename')
    .map((item) => ({ from: item.sourcePath, to: item.targetPath }));

  if (operations.length === 0) {
    return { status: 'nothing_to_do', runId: null, renamed: 0, rollbackErrors: [], warnings: [] };
  }

  const port = options.fs ?? nodeFsPort;
  const runId = JournalStore.createRunId();
  const warnings: string[] = [];

  // Validate before writing anything, then journal first: if it cannot be written, nothing is renamed.
  assertSafeOperations(operations);
  await options.journal?.create(runId, operations);

  const outcome = await runTwoPhase(operations, port, runId, options.onProgress);
  const result = toResult(outcome, runId, operations.length, warnings);
  await safeSetStatus(
    options.journal,
    runId,
    result.status === 'applied' ? 'applied' : result.status === 'rolled_back' ? 'rolled_back' : 'rollback_failed',
    warnings,
  );
  return result;
}

export interface UndoResult extends ExecutionResult {
  /** Run that was undone. */
  readonly undoneRunId: string | null;
}

/** Reverts the most recent applied run recorded in the journal store. */
export async function undoLast(store: JournalStore, options: Omit<ExecuteOptions, 'journal'> = {}): Promise<UndoResult> {
  const record = await store.latestApplied();
  if (!record) {
    return {
      status: 'nothing_to_do',
      runId: null,
      undoneRunId: null,
      renamed: 0,
      rollbackErrors: [],
      warnings: [],
    };
  }

  const reversed: JournalOperation[] = record.journal.operations.map((op) => ({ from: op.to, to: op.from }));
  const runId = JournalStore.createRunId();
  const warnings: string[] = [];
  const outcome = await runTwoPhase(reversed, options.fs ?? nodeFsPort, runId, options.onProgress);
  const result = toResult(outcome, runId, reversed.length, warnings);
  if (outcome.ok) {
    await safeSetStatus(store, record.journal.runId, 'undone', warnings);
  }
  return { ...result, undoneRunId: record.journal.runId };
}
