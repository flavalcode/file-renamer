import { ApiError } from './api.js';
import { loadScan, messageOf } from './actions.js';
import { h, replaceChildren } from './dom.js';
import { plural } from './format.js';
import { buildPresetInput } from './preset-builder.js';
import { renderPreviewTable } from './preview-table.js';
const REVIEW_ROWS = 1000;
function startOver(ctx) {
    const { state } = ctx;
    state.scan = null;
    state.plan = null;
    state.outcome = null;
    state.excluded = new Set();
    ctx.go(1);
}
async function reloadAndReview(ctx) {
    await loadScan(ctx, true);
    ctx.go(2);
}
function renderOutcome(root, ctx) {
    const { state, api } = ctx;
    const outcome = state.outcome;
    if (!outcome)
        return;
    const message = h('div', { role: 'status', class: 'status' });
    if (outcome.kind === 'applied') {
        const undo = h('button', { type: 'button', class: 'btn' }, 'Annulla questa rinomina');
        undo.addEventListener('click', async () => {
            undo.disabled = true;
            message.textContent = 'Ripristino in corso…';
            try {
                const result = await api.undo(outcome.result.runId ?? '');
                state.outcome = { kind: 'undone', result };
                await ctx.refreshInfo();
            }
            catch (error) {
                message.textContent = messageOf(error);
                undo.disabled = false;
            }
        });
        replaceChildren(root, h('h2', { tabindex: '-1', id: 'step-heading' }, 'Fatto!'), h('div', { class: 'card result result-ok' }, h('p', { class: 'big' }, `✔ ${plural(outcome.result.renamed, 'file rinominato', 'file rinominati')}`), h('p', { class: 'muted' }, state.scan?.root ?? ''), ...outcome.result.warnings.map((warning) => h('p', { class: 'banner banner-warn' }, warning)), h('div', { class: 'footer' }, undo, h('button', { type: 'button', class: 'btn btn-primary', onClick: () => startOver(ctx) }, 'Rinomina altri file')), message));
        return;
    }
    if (outcome.kind === 'undone') {
        replaceChildren(root, h('h2', { tabindex: '-1', id: 'step-heading' }, 'Rinomina annullata'), h('div', { class: 'card result result-ok' }, h('p', { class: 'big' }, outcome.result.status === 'applied' ? `↩ Ripristinati ${plural(outcome.result.renamed, 'file', 'file')}` : 'Non è stato possibile annullare'), outcome.result.failure ? h('p', { class: 'banner banner-error' }, outcome.result.failure) : null, h('div', { class: 'footer' }, h('span', {}), h('button', { type: 'button', class: 'btn btn-primary', onClick: () => startOver(ctx) }, 'Nuova rinomina'))));
        return;
    }
    const result = outcome.result;
    replaceChildren(root, h('h2', { tabindex: '-1', id: 'step-heading' }, 'Rinomina non completata'), h('div', { class: 'card result result-error' }, h('p', { class: 'big' }, result.status === 'rollback_failed' ? '⚠ Errore e ripristino incompleto' : 'Nessun file è stato modificato'), h('p', {}, `Motivo: ${result.failure ?? 'sconosciuto'}`), result.rollbackErrors.length > 0
        ? h('div', { class: 'banner banner-error' }, h('p', {}, 'Alcuni file potrebbero avere un nome temporaneo (.renamer-….tmp) nella cartella:'), h('ul', {}, ...result.rollbackErrors.map((error) => h('li', {}, error))))
        : null, h('div', { class: 'footer' }, h('span', {}), h('button', { type: 'button', class: 'btn btn-primary', onClick: () => void reloadAndReview(ctx).catch(() => startOver(ctx)) }, 'Ricarica i file'))));
}
export function renderStepConfirm(root, ctx) {
    const { state, api } = ctx;
    if (state.outcome) {
        renderOutcome(root, ctx);
        return;
    }
    const scan = state.scan;
    const plan = state.plan;
    if (!scan) {
        ctx.go(1);
        return;
    }
    if (!plan || plan.hasBlockingIssues || plan.summary.toRename === 0) {
        ctx.go(2);
        return;
    }
    const total = plan.summary.toRename;
    const problem = h('div', {});
    const confirm = h('button', { type: 'button', class: 'btn btn-primary btn-large' }, `Rinomina ${plural(total, 'file', 'file')}`);
    confirm.addEventListener('click', async () => {
        confirm.disabled = true;
        confirm.textContent = 'Rinomino…';
        replaceChildren(problem);
        try {
            const result = await api.apply({
                scanId: scan.scanId,
                excluded: [...state.excluded],
                preset: buildPresetInput(state.form),
                expectedPlanId: plan.planId,
            });
            state.outcome = result.status === 'applied' || result.status === 'nothing_to_do' ? { kind: 'applied', result } : { kind: 'failed', result };
            await ctx.refreshInfo();
        }
        catch (error) {
            confirm.disabled = false;
            confirm.textContent = `Rinomina ${plural(total, 'file', 'file')}`;
            if (error instanceof ApiError && (error.code === 'PLAN_CHANGED' || error.code === 'SCAN_EXPIRED')) {
                replaceChildren(problem, h('div', { class: 'banner banner-warn', role: 'alert' }, h('p', {}, error.message), h('button', { type: 'button', class: 'btn btn-small', onClick: () => void reloadAndReview(ctx).catch(() => startOver(ctx)) }, 'Aggiorna l\'anteprima')));
            }
            else {
                replaceChildren(problem, h('div', { class: 'banner banner-error', role: 'alert' }, messageOf(error)));
            }
        }
    });
    replaceChildren(root, h('h2', { tabindex: '-1', id: 'step-heading' }, '3. Conferma'), h('div', { class: 'card' }, h('p', { class: 'big' }, `Stai per rinominare ${plural(total, 'file', 'file')}`), h('p', { class: 'muted' }, scan.root), h('ul', { class: 'checklist' }, h('li', {}, 'L\'estensione di ogni file resta quella originale.'), h('li', {}, 'Nessun file esistente verrà sovrascritto.'), h('li', {}, 'Se qualcosa va storto, tutto viene ripristinato; dopo la rinomina potrai annullarla.'), plan.summary.unchanged > 0 ? h('li', {}, `${plural(plan.summary.unchanged, 'file', 'file')} restano invariati.`) : null)), h('div', { class: 'card' }, renderPreviewTable(plan.items, { maxRows: REVIEW_ROWS, hideUnchanged: true })), problem, h('div', { class: 'footer' }, h('button', { type: 'button', class: 'btn', onClick: () => ctx.go(2) }, '← Indietro'), confirm));
}
