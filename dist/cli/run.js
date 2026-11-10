import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PresetError, RenamerError, errorMessage } from '../core/errors.js';
import { parsePreset } from '../core/preset.js';
import { planDirectory } from '../app/service.js';
import { executePlan, undoLast } from '../fs/executor.js';
import { JournalStore, defaultStateDir } from '../fs/journal.js';
import { loadPresetFile } from '../fs/preset-file.js';
import { startWebServer } from '../web/server.js';
import { VERSION } from '../version.js';
import { UsageError, parseCommandLine } from './args.js';
import { createStyle, planToJson, renderPlan, renderResult } from './format.js';
import { HELP_TEXT } from './help.js';
export const EXIT = { ok: 0, error: 1, usage: 2, blocked: 3 };
async function resolvePreset(cmd) {
    const base = 'presetFile' in cmd.source ? await loadPresetFile(cmd.source.presetFile) : parsePreset(cmd.source.raw);
    if (Object.keys(cmd.filters).length === 0 || !('presetFile' in cmd.source)) {
        return base;
    }
    return parsePreset({ ...base, filters: { ...base.filters, ...cmd.filters } });
}
function storeFor(cmd, io) {
    return new JournalStore(cmd.stateDir ? path.resolve(io.cwd, cmd.stateDir) : defaultStateDir(io.env));
}
function styleFor(cmd, io) {
    return createStyle(io.isTTY && !cmd.noColor && io.env['NO_COLOR'] === undefined);
}
function exitFor(result) {
    return result.status === 'rolled_back' || result.status === 'rollback_failed' ? EXIT.error : EXIT.ok;
}
async function runRename(cmd, io) {
    const style = styleFor(cmd, io);
    const preset = await resolvePreset(cmd);
    const root = path.resolve(io.cwd, cmd.dir);
    const { plan, scan } = await planDirectory(root, preset);
    if (cmd.json) {
        io.stdout(`${JSON.stringify(planToJson(plan), null, 2)}\n`);
    }
    else {
        io.stdout(`${renderPlan(plan, scan.root, style, cmd.showAll)}\n`);
    }
    if (plan.hasBlockingIssues) {
        io.stderr(style.red('Piano bloccato: risolvi gli errori indicati sopra. Nessun file è stato modificato.\n'));
        return EXIT.blocked;
    }
    if (!cmd.apply) {
        if (!cmd.json && plan.summary.toRename > 0) {
            io.stdout(style.dim('Anteprima: nessun file modificato. Aggiungi --apply per procedere.\n'));
        }
        return EXIT.ok;
    }
    if (plan.summary.toRename === 0) {
        io.stdout('Nessun file da rinominare.\n');
        return EXIT.ok;
    }
    if (!cmd.yes) {
        if (!io.isTTY) {
            io.stderr('Modalità non interattiva: aggiungi --yes per confermare.\n');
            return EXIT.usage;
        }
        if (!(await io.confirm(`Rinominare ${plan.summary.toRename} file? [s/N] `))) {
            io.stdout('Annullato, nessun file modificato.\n');
            return EXIT.ok;
        }
    }
    const result = await executePlan(plan, { journal: storeFor(cmd, io) });
    io.stdout(cmd.json ? `${JSON.stringify({ result }, null, 2)}\n` : `${renderResult(result, style)}\n`);
    for (const warning of result.warnings)
        io.stderr(`Avviso: ${warning}\n`);
    return exitFor(result);
}
async function runUndo(cmd, io) {
    const style = styleFor(cmd, io);
    const store = storeFor(cmd, io);
    const latest = await store.latestApplied();
    if (!latest) {
        io.stdout('Nessuna rinomina da annullare.\n');
        return EXIT.ok;
    }
    const count = latest.journal.operations.length;
    if (!cmd.yes) {
        if (!io.isTTY) {
            io.stderr('Modalità non interattiva: aggiungi --yes per confermare.\n');
            return EXIT.usage;
        }
        const question = `Annullare la rinomina del ${latest.journal.createdAt} (${count} file)? [s/N] `;
        if (!(await io.confirm(question))) {
            io.stdout('Annullato, nessun file modificato.\n');
            return EXIT.ok;
        }
    }
    const result = await undoLast(store);
    io.stdout(cmd.json
        ? `${JSON.stringify({ result }, null, 2)}\n`
        : `${result.status === 'applied' ? style.green(`Ripristinati ${result.renamed} file.`) : renderResult(result, style)}\n`);
    return exitFor(result);
}
async function runHistory(cmd, io) {
    const records = await storeFor(cmd, io).list();
    if (cmd.json) {
        io.stdout(`${JSON.stringify(records.map((r) => r.journal), null, 2)}\n`);
    }
    else if (records.length === 0) {
        io.stdout('Nessuna rinomina registrata.\n');
    }
    else {
        for (const { journal } of records) {
            io.stdout(`${journal.createdAt}  ${journal.runId}  ${journal.status.padEnd(15)} ${journal.operations.length} file\n`);
        }
    }
    return EXIT.ok;
}
async function runUi(cmd, io) {
    const staticDir = io.webAssetsDir ?? fileURLToPath(new URL('../web/public', import.meta.url));
    if (!existsSync(path.join(staticDir, 'index.html'))) {
        io.stderr('Interfaccia web non trovata: esegui prima "npm run build".\n');
        return EXIT.error;
    }
    const stateDir = cmd.stateDir ? path.resolve(io.cwd, cmd.stateDir) : defaultStateDir(io.env);
    let server;
    try {
        server = await startWebServer({ stateDir, staticDir, port: cmd.port, debug: io.env['RENAMER_DEBUG'] !== undefined });
    }
    catch (error) {
        if (error.code === 'EADDRINUSE') {
            io.stderr(`La porta ${cmd.port} è già in uso: scegline un'altra con --port, oppure ometti l'opzione.\n`);
            return EXIT.error;
        }
        throw error;
    }
    io.stdout(`File Renamer è in esecuzione (solo su questo computer).\nApri nel browser: ${server.url}\nPremi Ctrl+C per terminare.\n`);
    if (!cmd.noOpen)
        io.openUrl?.(server.url);
    await (io.waitForShutdown?.() ?? new Promise(() => undefined));
    await server.close();
    io.stdout('Terminato.\n');
    return EXIT.ok;
}
async function dispatch(cmd, io) {
    switch (cmd.command) {
        case 'help':
            io.stdout(HELP_TEXT);
            return EXIT.ok;
        case 'version':
            io.stdout(`${VERSION}\n`);
            return EXIT.ok;
        case 'validate':
            await loadPresetFile(path.resolve(io.cwd, cmd.file));
            io.stdout('Preset valido.\n');
            return EXIT.ok;
        case 'history':
            return runHistory(cmd, io);
        case 'undo':
            return runUndo(cmd, io);
        case 'ui':
            return runUi(cmd, io);
        case 'rename':
            return runRename(cmd, io);
    }
}
export async function runCli(argv, io) {
    try {
        return await dispatch(parseCommandLine(argv), io);
    }
    catch (error) {
        if (error instanceof UsageError) {
            io.stderr(`Errore: ${error.message}\nUsa "renamer --help" per l'elenco delle opzioni.\n`);
            return EXIT.usage;
        }
        if (error instanceof PresetError) {
            io.stderr(`${error.message}\n`);
            return EXIT.usage;
        }
        if (error instanceof RenamerError) {
            io.stderr(`Errore: ${error.message}\n`);
            return EXIT.error;
        }
        io.stderr(`Errore imprevisto: ${errorMessage(error)}\n`);
        if (io.env['RENAMER_DEBUG'] && error instanceof Error && error.stack) {
            io.stderr(`${error.stack}\n`);
        }
        return EXIT.error;
    }
}
