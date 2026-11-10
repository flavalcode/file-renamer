/**
 * Contract between the local back-end and the browser UI.
 * Types only (no runtime code): imported by both sides.
 */

export interface Shortcut {
  readonly label: string;
  readonly path: string;
}

export interface UndoInfo {
  readonly runId: string;
  readonly createdAt: string;
  readonly count: number;
}

export interface InfoResponse {
  readonly version: string;
  readonly platform: string;
  readonly home: string;
  readonly shortcuts: readonly Shortcut[];
  readonly lastUndo: UndoInfo | null;
}

export interface FolderListing {
  /** Resolved absolute path (empty string = list of drives, Windows only). */
  readonly path: string;
  readonly parent: string | null;
  readonly folders: readonly string[];
  readonly truncated: boolean;
}

export interface ScanRequest {
  readonly path: string;
  readonly recursive: boolean;
  readonly includeHidden: boolean;
  /** Without dot, e.g. `["jpg","png"]`. Empty = all. */
  readonly extensions: readonly string[];
}

export interface ScanFile {
  /** Opaque identifier (path relative to the root, `/`-separated). */
  readonly id: string;
  /** Folder relative to the root (`''` = root). */
  readonly dir: string;
  readonly name: string;
  readonly size: number;
  readonly mtimeMs: number;
}

export interface ScanResponse {
  readonly scanId: string;
  readonly root: string;
  readonly files: readonly ScanFile[];
  readonly skipped: { readonly hidden: number; readonly symlinks: number; readonly filtered: number };
}

export interface PlanRequest {
  readonly scanId: string;
  /** Ids of the files the user deselected. */
  readonly excluded: readonly string[];
  /** Mode + rules/free + sequence. `filters` come from the scan, not from here. */
  readonly preset: unknown;
}

export interface ApplyRequest extends PlanRequest {
  /** `planId` of the preview the user confirmed. */
  readonly expectedPlanId: string;
}

export interface IssueDto {
  readonly severity: 'error' | 'warning';
  readonly code: string;
  readonly message: string;
}

export interface PlanItemDto {
  readonly id: string;
  readonly dir: string;
  readonly oldName: string;
  readonly newName: string;
  readonly status: 'rename' | 'unchanged' | 'blocked';
  readonly sequence: string | null;
  readonly issues: readonly IssueDto[];
}

export interface PlanResponse {
  readonly planId: string;
  readonly root: string;
  readonly summary: {
    readonly total: number;
    readonly toRename: number;
    readonly unchanged: number;
    readonly blocked: number;
    readonly warnings: number;
  };
  readonly hasBlockingIssues: boolean;
  readonly items: readonly PlanItemDto[];
}

export interface ApplyResponse {
  readonly status: 'applied' | 'rolled_back' | 'rollback_failed' | 'nothing_to_do';
  readonly runId: string | null;
  readonly renamed: number;
  readonly failure?: string;
  readonly rollbackErrors: readonly string[];
  readonly warnings: readonly string[];
}

export interface UndoRequest {
  readonly runId: string;
}

export interface UndoResponse extends ApplyResponse {
  readonly undoneRunId: string | null;
}

export interface ApiErrorBody {
  readonly error: string;
  readonly message: string;
  readonly issues?: readonly string[];
}
