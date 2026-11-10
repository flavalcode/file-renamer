/** Base class for all errors raised on purpose by this library. */
export class RenamerError extends Error {
  public readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
    this.code = code;
  }
}

/** A rule cannot be applied (bad parameters, unsafe regex, ...). */
export class RuleError extends RenamerError {
  constructor(message: string) {
    super('RULE_ERROR', message);
  }
}

/** The preset JSON is not valid. `issues` lists every problem found. */
export class PresetError extends RenamerError {
  public readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super('PRESET_INVALID', `Preset non valido:\n- ${issues.join('\n- ')}`);
    this.issues = issues;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Exhaustiveness guard for `switch` statements over discriminated unions. */
export function assertNever(value: never): never {
  throw new RenamerError('INTERNAL', `Valore inatteso: ${JSON.stringify(value)}`);
}
