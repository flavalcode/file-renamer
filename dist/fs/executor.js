import path from 'node:path';
import { RenamerError, errorMessage } from '../core/errors.js';
import { collisionKey } from '../core/filename.js';
import { nodeFsPort } from './fs-port.js';
import { JournalStore } from './journal.js';
class PreflightError extends Error {
}
function assertSafeOperations(operations) {
    const sources = new Set();
    const targets = new Set();
    for (const { from, to } of operations) {
        if (!path.isAbsolute(from) || !path.isAbsolute(to)) {
            throw new RenamerError('UNSAFE_OPERATION', 'Percorso non assoluto.');
        }
        if (path.dirname(from) !== path.dirname(to)) {
            throw new RenamerError('UNSAFE_OPERATION', 'Un file può essere rinominato solo nella sua cartella.');
        }
        if (sources.has(from) || targets.has(to)) {
            throw new RenamerError('UNSAFE_OPERATION', 'Operazioni duplicate nel piano.');
        }
        sources.add(from);
        targets.add(to);
    }
}
async function preflight(operations, port) {
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
async function runTwoPhase(operations, port, runId, onProgress) {
    assertSafeOperations(operations);
    try {
        await preflight(operations, port);
    }
    catch (error) {
        if (error instanceof PreflightError) {
            return { ok: false, failure: error.message, rollbackErrors: [] };
        }
        return { ok: false, failure: errorMessage(error), rollbackErrors: [] };
    }
    const done = [];
    const temps = operations.map((op, index) => path.join(path.dirname(op.from), `.renamer-${runId}-${index}.tmp`));
    const total = operations.length * 2;
    const move = async (from, to) => {
        await port.rename(from, to);
        done.push({ from, to });
        onProgress?.(done.length, total);
    };
    try {
        for (const [index, op] of operations.entries()) {
            const temp = temps[index];
            if ((await port.kind(temp)) !== 'missing') {
                throw new Error(`Nome temporaneo già in uso: ${temp}`);
            }
            await move(op.from, temp);
        }
        for (const [index, op] of operations.entries()) {
            if ((await port.kind(op.to)) !== 'missing') {
                throw new Error(`La destinazione è apparsa durante l'operazione: ${op.to}`);
            }
            await move(temps[index], op.to);
        }
        return { ok: true };
    }
    catch (error) {
        const rollbackErrors = [];
        for (const step of done.reverse()) {
            try {
                await port.rename(step.to, step.from);
            }
            catch (rollbackError) {
                rollbackErrors.push(`${step.to} -> ${step.from}: ${errorMessage(rollbackError)}`);
            }
        }
        return { ok: false, failure: errorMessage(error), rollbackErrors };
    }
}
function toResult(outcome, runId, count, warnings) {
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
async function safeSetStatus(store, runId, status, warnings) {
    if (!store)
        return;
    try {
        await store.setStatus(runId, status);
    }
    catch (error) {
        warnings.push(`Impossibile aggiornare il registro di annullamento: ${errorMessage(error)}`);
    }
}
export async function executePlan(plan, options = {}) {
    if (plan.hasBlockingIssues) {
        throw new RenamerError('PLAN_BLOCKED', 'Il piano contiene errori o conflitti: non può essere eseguito.');
    }
    const operations = plan.items
        .filter((item) => item.status === 'rename')
        .map((item) => ({ from: item.sourcePath, to: item.targetPath }));
    if (operations.length === 0) {
        return { status: 'nothing_to_do', runId: null, renamed: 0, rollbackErrors: [], warnings: [] };
    }
    const port = options.fs ?? nodeFsPort;
    const runId = JournalStore.createRunId();
    const warnings = [];
    assertSafeOperations(operations);
    await options.journal?.create(runId, operations);
    const outcome = await runTwoPhase(operations, port, runId, options.onProgress);
    const result = toResult(outcome, runId, operations.length, warnings);
    await safeSetStatus(options.journal, runId, result.status === 'applied' ? 'applied' : result.status === 'rolled_back' ? 'rolled_back' : 'rollback_failed', warnings);
    return result;
}
export async function undoLast(store, options = {}) {
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
    const reversed = record.journal.operations.map((op) => ({ from: op.to, to: op.from }));
    const runId = JournalStore.createRunId();
    const warnings = [];
    const outcome = await runTwoPhase(reversed, options.fs ?? nodeFsPort, runId, options.onProgress);
    const result = toResult(outcome, runId, reversed.length, warnings);
    if (outcome.ok) {
        await safeSetStatus(store, record.journal.runId, 'undone', warnings);
    }
    return { ...result, undoneRunId: record.journal.runId };
}
