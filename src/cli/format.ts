import path from 'node:path';
import type { PlanItem, RenamePlan } from '../core/types.js';
import type { ExecutionResult } from '../fs/executor.js';

export interface Style {
  green(text: string): string;
  red(text: string): string;
  yellow(text: string): string;
  dim(text: string): string;
  bold(text: string): string;
}

export function createStyle(enabled: boolean): Style {
  const wrap = (open: number, close: number) => (text: string): string =>
    enabled ? `\u001b[${open}m${text}\u001b[${close}m` : text;
  return {
    green: wrap(32, 39),
    red: wrap(31, 39),
    yellow: wrap(33, 39),
    dim: wrap(2, 22),
    bold: wrap(1, 22),
  };
}

function relativeOld(root: string, item: PlanItem): string {
  return path.relative(root, item.sourcePath);
}

/** Human-readable preview of a plan. */
export function renderPlan(plan: RenamePlan, root: string, style: Style, showAll: boolean): string {
  const lines: string[] = [];
  for (const item of plan.items) {
    if (item.status === 'unchanged' && !showAll) continue;
    const before = relativeOld(root, item);
    if (item.status === 'rename') {
      lines.push(`${style.green('✔')} ${before}  →  ${style.bold(item.newBase)}`);
    } else if (item.status === 'unchanged') {
      lines.push(`${style.dim('=')} ${style.dim(before)}  ${style.dim('(invariato)')}`);
    } else {
      lines.push(`${style.red('✖')} ${before}  →  ${item.newBase}`);
    }
    for (const issue of item.issues) {
      const tag = issue.severity === 'error' ? style.red('errore') : style.yellow('avviso');
      lines.push(`    ${tag}: ${issue.message}`);
    }
  }

  const { summary } = plan;
  if (lines.length > 0) lines.push('');
  lines.push(
    `File: ${summary.total} · da rinominare: ${summary.toRename} · invariati: ${summary.unchanged} · ` +
      `bloccati: ${summary.blocked} · avvisi: ${summary.warnings}`,
  );
  return lines.join('\n');
}

export function planToJson(plan: RenamePlan): unknown {
  return {
    summary: plan.summary,
    hasBlockingIssues: plan.hasBlockingIssues,
    items: plan.items.map((item) => ({
      source: item.sourcePath,
      target: item.targetPath,
      oldName: item.oldBase,
      newName: item.newBase,
      sequence: item.sequence,
      status: item.status,
      issues: item.issues,
    })),
  };
}

export function renderResult(result: ExecutionResult, style: Style): string {
  switch (result.status) {
    case 'applied':
      return style.green(`Fatto: ${result.renamed} file rinominati. Per annullare: renamer undo`);
    case 'nothing_to_do':
      return 'Nessun file da rinominare.';
    case 'rolled_back':
      return style.red(`Operazione annullata, nessun file modificato. Motivo: ${result.failure ?? 'sconosciuto'}`);
    case 'rollback_failed':
      return style.red(
        `ATTENZIONE: errore e ripristino incompleto. Motivo: ${result.failure ?? 'sconosciuto'}\n` +
          `Problemi nel ripristino:\n- ${result.rollbackErrors.join('\n- ')}\n` +
          'Cerca nella cartella eventuali file ".renamer-*.tmp" (sono i tuoi file con nome temporaneo).',
      );
  }
}
