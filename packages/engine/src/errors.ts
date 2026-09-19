export type EngineErrorCode =
  | "VALIDATION" | "LIBRARY_NOT_LOCKED" | "PACKAGE_CORRUPT" | "PACKAGE_CHECKSUM"
  | "ASSET_LENGTH" | "ASSET_HASH" | "ASSET_MISSING" | "ASSET_TYPE"
  | "DUPLICATE_ENTRY" | "NOT_IMPLEMENTED" | "HANDLER_MISSING";

export type IssueCode = "SCHEMA" | "SEMANTICS" | "CLOSURE" | "ASSET_MISSING" | "ASSET_TYPE" | "NOT_IMPLEMENTED" | "HANDLER_MISSING";

/** Failures the caller's spec caused, reported as issues by validate(); everything else is an engine or registry failure and stays an exception. */
export const SPEC_ATTRIBUTABLE: ReadonlySet<EngineErrorCode> = new Set(["ASSET_MISSING", "ASSET_TYPE", "NOT_IMPLEMENTED", "HANDLER_MISSING"]);

export class EngineError extends Error {
  constructor(message: string, public readonly code: EngineErrorCode, public readonly path?: string) {
    super(message);
    this.name = "EngineError";
  }
}

export interface ValidationIssue { path: string; message: string; code?: IssueCode; }

export class ValidationError extends EngineError {
  constructor(public readonly issues: ValidationIssue[]) {
    super(`validation failed: ${issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`, "VALIDATION");
    this.name = "ValidationError";
  }
}
