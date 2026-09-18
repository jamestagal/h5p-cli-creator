export class EngineError extends Error {
  constructor(message: string, public readonly code: string) { super(message); this.name = "EngineError"; }
}

export interface ValidationIssue { path: string; message: string; }

export class ValidationError extends EngineError {
  constructor(public readonly issues: ValidationIssue[]) {
    super(`validation failed: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`, "VALIDATION");
    this.name = "ValidationError";
  }
}
