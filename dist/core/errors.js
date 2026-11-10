export class RenamerError extends Error {
    code;
    constructor(code, message, options) {
        super(message, options);
        this.name = new.target.name;
        this.code = code;
    }
}
export class RuleError extends RenamerError {
    constructor(message) {
        super('RULE_ERROR', message);
    }
}
export class PresetError extends RenamerError {
    issues;
    constructor(issues) {
        super('PRESET_INVALID', `Preset non valido:\n- ${issues.join('\n- ')}`);
        this.issues = issues;
    }
}
export function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
export function assertNever(value) {
    throw new RenamerError('INTERNAL', `Valore inatteso: ${JSON.stringify(value)}`);
}
