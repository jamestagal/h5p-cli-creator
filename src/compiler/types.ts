/**
 * Library dependency information from library.json
 */
export interface LibraryDependency {
  machineName: string;
  majorVersion: number;
  minorVersion: number;
}

/**
 * Preloaded JavaScript file reference
 */
export interface PreloadedJs {
  path: string;
}

/**
 * Preloaded CSS file reference
 */
export interface PreloadedCss {
  path: string;
}

/**
 * Complete library metadata extracted from library.json and semantics.json
 */
export interface LibraryMetadata {
  machineName: string;
  title: string;
  majorVersion: number;
  minorVersion: number;
  patchVersion: number;
  runnable?: number;
  fullscreen?: number;
  embedTypes?: string[];
  preloadedJs?: PreloadedJs[];
  preloadedCss?: PreloadedCss[];
  preloadedDependencies?: LibraryDependency[];
  editorDependencies?: LibraryDependency[];
  dynamicDependencies?: LibraryDependency[];
  semantics?: any;
  libraryDirectory?: string;
}

/**
 * Library.json file structure
 */
export interface LibraryJson {
  machineName: string;
  title: string;
  majorVersion: number;
  minorVersion: number;
  patchVersion: number;
  runnable?: number;
  fullscreen?: number;
  embedTypes?: string[];
  preloadedJs?: PreloadedJs[];
  preloadedCss?: PreloadedCss[];
  preloadedDependencies?: LibraryDependency[];
  editorDependencies?: LibraryDependency[];
  dynamicDependencies?: LibraryDependency[];
}

/**
 * Field definition from semantics.json
 */
export interface FieldDefinition {
  name: string;
  type: string;
  label?: string;
  description?: string;
  importance?: string;
  default?: any;
  optional?: boolean;
  widget?: string;
  options?: string[];
  min?: number;
  max?: number;
  pattern?: string;
  common?: boolean;
  fields?: FieldDefinition[];
  field?: FieldDefinition;
}

/**
 * Parsed semantic schema from semantics.json
 */
export interface SemanticSchema {
  fields: FieldDefinition[];
}

/**
 * Validation error with field path and message
 */
export interface ValidationError {
  fieldPath: string;
  message: string;
  expectedType?: string;
  actualType?: string;
}

/**
 * Result of content validation
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}
