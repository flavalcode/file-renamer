import type { FileEntry, Issue } from '../types.js';

/** Everything a rule may need besides the file name itself. */
export interface RuleContext {
  readonly entry: FileEntry;
  /** Name of the folder that contains the file. */
  readonly parentName: string;
  /** "Now", injected so results are reproducible in tests. */
  readonly now: Date;
  /** Reports a non-blocking problem for the current file. */
  warn(issue: Omit<Issue, 'severity'>): void;
}
