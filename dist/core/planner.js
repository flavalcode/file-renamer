import path from 'node:path';
import { RenamerError, RuleError, errorMessage } from './errors.js';
import { collisionKey, toNfc } from './filename.js';
import { naturalCompare } from './natural-sort.js';
import { FREE_NAME_TOKENS, applyRules, expandTemplate, resolveDateToken } from './rules/index.js';
import { assignSequence } from './sequence.js';
import { validateFileName } from './validation.js';
export function buildPlan(entries, preset, options = {}) {
    const now = options.now ?? new Date();
    const ordered = orderForProcessing(entries, preset);
    const drafts = ordered.map(({ entry, sequence }) => draftItem(entry, sequence, preset, now));
    applyCollisionChecks(drafts, options.siblings);
    const items = drafts.map(toPlanItem);
    return { items, summary: summarize(items), hasBlockingIssues: items.some((i) => i.status === 'blocked') };
}
function sequenceOptionsOf(preset) {
    return preset.mode === 'free' ? preset.free : preset.sequence;
}
function orderForProcessing(entries, preset) {
    const sequence = sequenceOptionsOf(preset);
    if (sequence) {
        return assignSequence(entries, sequence).map((s) => ({
            entry: s.entry,
            sequence: s.sequence,
        }));
    }
    const sorted = [...entries].sort((a, b) => naturalCompare(a.dir, b.dir) || naturalCompare(a.base, b.base));
    return sorted.map((entry) => ({ entry, sequence: null }));
}
function draftItem(entry, sequence, preset, now) {
    const issues = [];
    const ctx = {
        entry,
        parentName: path.basename(entry.dir),
        now,
        warn: (issue) => issues.push({ ...issue, severity: 'warning' }),
    };
    let stem;
    try {
        stem = computeStem(entry, preset, ctx);
    }
    catch (error) {
        issues.push({ code: 'RULE_ERROR', severity: 'error', message: errorMessage(error) });
        return { entry, sequence, newBase: entry.base, unchanged: false, issues };
    }
    if (sequence !== null) {
        const delimiter = sequenceOptionsOf(preset)?.delimiter ?? '';
        stem += delimiter + sequence;
    }
    const newBase = toNfc(stem) + entry.ext;
    if (!newBase.endsWith(entry.ext)) {
        throw new RenamerError('INTERNAL', 'Invariante violata: estensione alterata');
    }
    const unchanged = toNfc(entry.base) === newBase;
    if (!unchanged) {
        issues.push(...validateFileName(newBase.slice(0, newBase.length - entry.ext.length), entry.ext, entry.dir));
    }
    return { entry, sequence, newBase, unchanged, issues };
}
function computeStem(entry, preset, ctx) {
    if (preset.mode === 'rules') {
        return applyRules(preset.rules, entry.name, ctx);
    }
    const stem = expandTemplate(preset.free.name, FREE_NAME_TOKENS, (token, argument) => token === 'parent' ? ctx.parentName : resolveDateToken(token, argument, ctx));
    if (stem.length === 0) {
        throw new RuleError('Il nome personalizzato è vuoto.');
    }
    return stem;
}
function applyCollisionChecks(drafts, siblings) {
    const claims = new Map();
    const batchOriginals = new Map();
    for (const draft of drafts) {
        const dir = draft.entry.dir;
        const originals = batchOriginals.get(dir) ?? new Set();
        originals.add(collisionKey(draft.entry.base));
        batchOriginals.set(dir, originals);
        const claimed = draft.unchanged ? draft.entry.base : draft.newBase;
        const key = `${dir}\u0000${collisionKey(claimed)}`;
        claims.set(key, [...(claims.get(key) ?? []), draft]);
    }
    for (const group of claims.values()) {
        if (group.length < 2) {
            continue;
        }
        for (const draft of group) {
            if (!draft.unchanged) {
                draft.issues.push({
                    code: 'DUPLICATE_TARGET',
                    severity: 'error',
                    message: `Più file otterrebbero lo stesso nome: "${draft.newBase}".`,
                });
            }
        }
    }
    if (!siblings) {
        return;
    }
    for (const draft of drafts) {
        if (draft.unchanged) {
            continue;
        }
        const dir = draft.entry.dir;
        const originals = batchOriginals.get(dir);
        const targetKey = collisionKey(draft.newBase);
        const occupied = (siblings.get(dir) ?? []).some((name) => {
            const key = collisionKey(name);
            return key === targetKey && !originals?.has(key);
        });
        if (occupied) {
            draft.issues.push({
                code: 'EXISTS_ON_DISK',
                severity: 'error',
                message: `Esiste già un elemento chiamato "${draft.newBase}" nella cartella.`,
            });
        }
    }
}
function toPlanItem(draft) {
    const hasError = draft.issues.some((i) => i.severity === 'error');
    const { entry } = draft;
    return {
        entry,
        sourcePath: path.join(entry.dir, entry.base),
        targetPath: path.join(entry.dir, draft.newBase),
        oldBase: entry.base,
        newBase: draft.newBase,
        sequence: draft.sequence,
        status: hasError ? 'blocked' : draft.unchanged ? 'unchanged' : 'rename',
        issues: draft.issues,
    };
}
function summarize(items) {
    const count = (status) => items.filter((i) => i.status === status).length;
    return {
        total: items.length,
        toRename: count('rename'),
        unchanged: count('unchanged'),
        blocked: count('blocked'),
        warnings: items.reduce((n, i) => n + i.issues.filter((x) => x.severity === 'warning').length, 0),
    };
}
