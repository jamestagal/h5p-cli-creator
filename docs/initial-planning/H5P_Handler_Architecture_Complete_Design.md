# H5P CLI Creator - Handler/Plugin Architecture: Complete Design & Implementation Guide

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Core Interfaces](#core-interfaces)
3. [Registry Implementation](#registry-implementation)
4. [Context Implementation](#context-implementation)
5. [Example Handler Implementations](#example-handler-implementations)
6. [CLI Integration](#cli-integration)
7. [Testing Strategy](#testing-strategy)
8. [Migration Guide](#migration-guide)
9. [Documentation Templates](#documentation-templates)
10. [Deployment Checklist](#deployment-checklist)

---

## Architecture Overview

### Design Principles

**1. Interface-Driven Design**
- Every content type implements `ContentHandler` interface
- Guarantees consistent API across all handlers
- Enables polymorphic handler management

**2. Separation of Concerns**
- Handlers focus on content generation logic only
- Registry manages handler lifecycle
- Context provides shared utilities
- CLI orchestrates the workflow

**3. Extensibility First**
- Adding new handlers requires minimal code
- No modifications to core infrastructure
- Plugin-like architecture for community contributions

**4. Backward Compatibility**
- Existing CLI commands work unchanged
- Migration path for existing code
- Gradual adoption possible

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI Layer                            │
│  (index.ts - Command parsing & orchestration)               │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    Handler Registry                          │
│  - Register handlers                                         │
│  - Discover handlers                                         │
│  - Generate CLI commands dynamically                         │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   Content Handlers                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Flashcards  │  │ DialogCards  │  │ Interactive  │     │
│  │   Handler    │  │   Handler    │  │     Book     │ ... │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│  Each implements ContentHandler interface                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   Handler Context                            │
│  - File operations (copy, validate)                         │
│  - MIME type detection                                       │
│  - Logging                                                   │
│  - H5P package utilities                                     │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  H5P Package Builder                         │
│  - Extract templates                                         │
│  - Modify content.json                                       │
│  - Package as .h5p                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Interfaces

### 1. ContentHandler Interface

**File: `src/handlers/ContentHandler.ts`**

```typescript
/**
 * Base interface that all H5P content type handlers must implement.
 * This ensures consistent behavior and API across all content types.
 */
export interface ContentHandler {
  /**
   * Unique identifier for this content type (used in CLI commands)
   * Example: "flashcards", "dialogcards", "interactivebook"
   */
  readonly type: string;

  /**
   * Display name for documentation and help text
   * Example: "Flashcards", "Dialog Cards", "Interactive Book"
   */
  readonly displayName: string;

  /**
   * Brief description of what this content type does
   * Used in CLI help and documentation generation
   */
  readonly description: string;

  /**
   * H5P library name this handler generates content for
   * Example: "H5P.Flashcards", "H5P.DialogCards", "H5P.InteractiveBook"
   */
  readonly libraryName: string;

  /**
   * Validate input data before processing.
   * This should check:
   * - Required fields are present
   * - Data types are correct
   * - File paths exist (if applicable)
   * - Values are within acceptable ranges
   * 
   * @param data - Parsed data from CSV or other input
   * @returns ValidationResult with success status and optional error message
   */
  validate(data: any): ValidationResult;

  /**
   * Transform input data into H5P content structure.
   * This is the core method that generates the content.json structure
   * for the specific H5P content type.
   * 
   * @param data - Validated input data
   * @param context - Utilities for file operations, logging, etc.
   * @returns H5P content structure ready for content.json
   */
  generate(data: any, context: HandlerContext): H5PContent | Promise<H5PContent>;

  /**
   * Parse CSV file into structured data.
   * Each handler defines its own CSV format based on content type needs.
   * 
   * @param csvPath - Path to CSV file
   * @returns Parsed data object or array
   */
  parseCSV(csvPath: string): any | Promise<any>;

  /**
   * Define expected CSV columns for this content type.
   * Used for:
   * - Generating CSV templates
   * - Documentation generation
   * - Validation
   * 
   * @returns Array of column definitions
   */
  getCSVColumns(): CSVColumnDefinition[];

  /**
   * Generate CLI command options specific to this content type.
   * These appear in the command help and are passed to the handler.
   * 
   * @returns Array of CLI option definitions
   */
  getCLIOptions(): CLIOption[];

  /**
   * Optional: Perform cleanup operations after content generation.
   * Use for:
   * - Closing file handles
   * - Cleaning temporary files
   * - Releasing resources
   */
  cleanup?(): void | Promise<void>;
}

/**
 * Result of data validation
 */
export interface ValidationResult {
  /** Whether validation passed */
  valid: boolean;
  
  /** Error message if validation failed */
  error?: string;
  
  /** Array of specific validation errors (for detailed reporting) */
  errors?: ValidationError[];
}

/**
 * Detailed validation error
 */
export interface ValidationError {
  /** Field or property that failed validation */
  field: string;
  
  /** Error message */
  message: string;
  
  /** Actual value that failed validation */
  value?: any;
}

/**
 * H5P content structure (what goes in content.json)
 */
export interface H5PContent {
  /** Main content parameters */
  params?: any;
  
  /** Content metadata */
  metadata?: H5PMetadata;
  
  /** Library-specific structure */
  [key: string]: any;
}

/**
 * H5P content metadata
 */
export interface H5PMetadata {
  title?: string;
  authors?: Array<{ name: string; role: string }>;
  license?: string;
  licenseVersion?: string;
  yearFrom?: number;
  yearTo?: number;
  source?: string;
  changes?: any[];
  authorComments?: string;
  contentType?: string;
  defaultLanguage?: string;
}

/**
 * CSV column definition
 */
export interface CSVColumnDefinition {
  /** Column name/header */
  name: string;
  
  /** Whether this column is required */
  required: boolean;
  
  /** Human-readable description */
  description: string;
  
  /** Example value */
  example: string;
  
  /** Data type expected */
  type?: 'string' | 'number' | 'boolean' | 'url' | 'path';
  
  /** Default value if not provided */
  defaultValue?: any;
}

/**
 * CLI option definition
 */
export interface CLIOption {
  /** Option flag (e.g., "-l, --language") */
  flags: string;
  
  /** Description for help text */
  description: string;
  
  /** Default value */
  defaultValue?: any;
  
  /** Whether option is required */
  required?: boolean;
}

/**
 * Shared utilities provided to handlers
 */
export interface HandlerContext {
  /** Working directory for H5P package construction */
  readonly workDir: string;
  
  /** Logger instance */
  readonly logger: Logger;
  
  /** H5P package builder utilities */
  readonly packageBuilder: H5PPackageBuilder;
  
  /**
   * Copy a file to the H5P package directory structure.
   * Handles:
   * - Creating destination directories
   * - Avoiding filename collisions
   * - Validation
   * 
   * @param sourcePath - Path to source file
   * @param destSubDir - Subdirectory within content/ (e.g., "images", "audios")
   * @returns Filename in destination (may be renamed to avoid collisions)
   */
  copyFile(sourcePath: string, destSubDir: string): string | Promise<string>;
  
  /**
   * Get MIME type for a file based on extension.
   * 
   * @param filename - Filename or path
   * @returns MIME type string (e.g., "image/jpeg", "audio/mpeg")
   */
  getMimeType(filename: string): string;
  
  /**
   * Validate that a file exists and is accessible.
   * 
   * @param filePath - Path to check
   * @returns true if file exists and is readable
   */
  validateFile(filePath: string): boolean;
  
  /**
   * Generate a unique filename to avoid collisions.
   * 
   * @param originalName - Original filename
   * @returns Unique filename (may have suffix added)
   */
  generateUniqueFilename(originalName: string): string;
  
  /**
   * Read and parse a CSV file.
   * 
   * @param csvPath - Path to CSV file
   * @param options - Parsing options
   * @returns Array of row objects
   */
  parseCSVFile(csvPath: string, options?: CSVParseOptions): any[] | Promise<any[]>;
  
  /**
   * Log a message.
   * 
   * @param message - Message to log
   * @param level - Log level
   */
  log(message: string, level?: LogLevel): void;
}

/**
 * CSV parsing options
 */
export interface CSVParseOptions {
  /** Column delimiter (default: ",") */
  delimiter?: string;
  
  /** Whether first row contains headers (default: true) */
  headers?: boolean;
  
  /** Skip empty lines (default: true) */
  skipEmptyLines?: boolean;
  
  /** Trim whitespace from values (default: true) */
  trim?: boolean;
}

/**
 * Log levels
 */
export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

/**
 * Logger interface
 */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

/**
 * H5P Package Builder interface (existing functionality)
 */
export interface H5PPackageBuilder {
  extractTemplate(templatePath: string): string | Promise<string>;
  loadContent(workDir: string): any;
  saveContent(workDir: string, content: any): void;
  updateH5pJson(workDir: string, updates: any): void;
  packageH5P(workDir: string, outputPath: string): Promise<void>;
  cleanup(workDir: string): void;
}
```

---

## Registry Implementation

### HandlerRegistry Class

**File: `src/handlers/HandlerRegistry.ts`**

```typescript
import { ContentHandler, Logger } from './ContentHandler';

/**
 * Central registry for managing content type handlers.
 * Responsibilities:
 * - Register handlers
 * - Discover available handlers
 * - Validate handler compatibility
 * - Generate CLI commands
 * - Generate documentation
 */
export class HandlerRegistry {
  private handlers: Map<string, ContentHandler> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Register a content handler.
   * 
   * @param handler - Handler to register
   * @throws Error if handler with same type already registered
   */
  register(handler: ContentHandler): void {
    if (this.handlers.has(handler.type)) {
      throw new Error(
        `Handler already registered for type: ${handler.type}. ` +
        `Existing: ${this.handlers.get(handler.type)?.displayName}`
      );
    }

    // Validate handler has required methods
    this.validateHandler(handler);

    this.handlers.set(handler.type, handler);
    this.logger.info(
      `✅ Registered handler: ${handler.displayName} (${handler.type})`
    );
  }

  /**
   * Validate handler implements required interface
   */
  private validateHandler(handler: ContentHandler): void {
    const requiredMethods = [
      'validate',
      'generate',
      'parseCSV',
      'getCSVColumns',
      'getCLIOptions'
    ];

    for (const method of requiredMethods) {
      if (typeof (handler as any)[method] !== 'function') {
        throw new Error(
          `Handler ${handler.type} missing required method: ${method}`
        );
      }
    }

    // Validate required properties
    const requiredProps = ['type', 'displayName', 'description', 'libraryName'];
    for (const prop of requiredProps) {
      if (!(prop in handler) || !(handler as any)[prop]) {
        throw new Error(
          `Handler ${handler.type} missing required property: ${prop}`
        );
      }
    }
  }

  /**
   * Get handler by type.
   * 
   * @param type - Handler type identifier
   * @returns Handler instance or undefined
   */
  get(type: string): ContentHandler | undefined {
    return this.handlers.get(type);
  }

  /**
   * Check if handler exists for type.
   * 
   * @param type - Handler type identifier
   * @returns true if handler exists
   */
  has(type: string): boolean {
    return this.handlers.has(type);
  }

  /**
   * Get all registered handler types.
   * 
   * @returns Array of type identifiers
   */
  getTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get all registered handlers.
   * 
   * @returns Array of handler instances
   */
  getAll(): ContentHandler[] {
    return Array.from(this.handlers.values());
  }

  /**
   * Unregister a handler.
   * Useful for testing or dynamic handler management.
   * 
   * @param type - Handler type identifier
   * @returns true if handler was removed
   */
  unregister(type: string): boolean {
    const removed = this.handlers.delete(type);
    if (removed) {
      this.logger.info(`Unregistered handler: ${type}`);
    }
    return removed;
  }

  /**
   * Clear all registered handlers.
   * Primarily for testing.
   */
  clear(): void {
    this.handlers.clear();
    this.logger.debug('Cleared all handlers');
  }

  /**
   * Get handler count.
   * 
   * @returns Number of registered handlers
   */
  count(): number {
    return this.handlers.size;
  }

  /**
   * Generate comprehensive CSV template documentation.
   * Includes all registered handlers with their column definitions.
   * 
   * @returns Markdown-formatted documentation
   */
  generateCSVDocumentation(): string {
    let doc = '# H5P CLI Creator - CSV Format Reference\n\n';
    doc += 'This document describes the CSV format for each supported content type.\n\n';
    doc += '## Table of Contents\n\n';

    // Generate table of contents
    for (const handler of this.handlers.values()) {
      doc += `- [${handler.displayName}](#${this.slugify(handler.displayName)})\n`;
    }
    doc += '\n---\n\n';

    // Generate documentation for each handler
    for (const handler of this.handlers.values()) {
      doc += `## ${handler.displayName}\n\n`;
      doc += `**Type:** \`${handler.type}\`\n\n`;
      doc += `**Description:** ${handler.description}\n\n`;
      doc += `**Library:** ${handler.libraryName}\n\n`;

      doc += '### CSV Columns\n\n';
      const columns = handler.getCSVColumns();
      
      if (columns.length === 0) {
        doc += '*No specific column requirements documented.*\n\n';
      } else {
        doc += '| Column | Required | Type | Description | Example |\n';
        doc += '|--------|----------|------|-------------|--------|\n';

        for (const col of columns) {
          const required = col.required ? '**Yes**' : 'No';
          const type = col.type || 'string';
          doc += `| \`${col.name}\` | ${required} | ${type} | ${col.description} | ${col.example} |\n`;
        }
        doc += '\n';
      }

      // CLI options
      const options = handler.getCLIOptions();
      if (options.length > 0) {
        doc += '### CLI Options\n\n';
        doc += '| Option | Description | Default |\n';
        doc += '|--------|-------------|--------|\n';
        
        for (const opt of options) {
          const defaultVal = opt.defaultValue !== undefined 
            ? `\`${opt.defaultValue}\`` 
            : '*none*';
          doc += `| \`${opt.flags}\` | ${opt.description} | ${defaultVal} |\n`;
        }
        doc += '\n';
      }

      // Example usage
      doc += '### Example Usage\n\n';
      doc += '```bash\n';
      doc += `node ./dist/index.js ${handler.type} ./input.csv ./output.h5p`;
      
      if (options.length > 0) {
        doc += ' \\\n';
        for (let i = 0; i < Math.min(options.length, 2); i++) {
          const opt = options[i];
          const flag = opt.flags.split(',')[1]?.trim() || opt.flags.split(',')[0].trim();
          doc += `  ${flag}="value"`;
          if (i < Math.min(options.length, 2) - 1) doc += ' \\\n';
        }
      }
      doc += '\n```\n\n';

      // Example CSV
      doc += '### Example CSV\n\n';
      doc += '```csv\n';
      const exampleColumns = columns.slice(0, 4); // Show first 4 columns
      doc += exampleColumns.map(c => c.name).join(',') + '\n';
      doc += exampleColumns.map(c => c.example).join(',') + '\n';
      doc += '```\n\n';

      doc += '---\n\n';
    }

    return doc;
  }

  /**
   * Generate CLI command list for help text.
   * 
   * @returns Formatted string for CLI help
   */
  generateCommandList(): string {
    let list = 'Available content types:\n\n';
    
    for (const handler of this.handlers.values()) {
      list += `  ${handler.type.padEnd(20)} ${handler.description}\n`;
    }
    
    return list;
  }

  /**
   * Validate CSV headers against handler requirements.
   * 
   * @param type - Handler type
   * @param headers - CSV headers from file
   * @returns ValidationResult
   */
  validateCSVHeaders(type: string, headers: string[]): {
    valid: boolean;
    errors: string[];
  } {
    const handler = this.get(type);
    if (!handler) {
      return {
        valid: false,
        errors: [`Unknown content type: ${type}`]
      };
    }

    const errors: string[] = [];
    const columns = handler.getCSVColumns();
    const requiredColumns = columns.filter(c => c.required);

    // Check for required columns
    for (const col of requiredColumns) {
      if (!headers.includes(col.name)) {
        errors.push(
          `Missing required column: ${col.name} (${col.description})`
        );
      }
    }

    // Check for unknown columns (warning, not error)
    const knownColumns = columns.map(c => c.name);
    for (const header of headers) {
      if (!knownColumns.includes(header)) {
        this.logger.warn(
          `Unknown column in CSV: ${header} (will be ignored)`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate empty CSV template for a content type.
   * 
   * @param type - Handler type
   * @returns CSV template string
   */
  generateCSVTemplate(type: string): string {
    const handler = this.get(type);
    if (!handler) {
      throw new Error(`Unknown content type: ${type}`);
    }

    const columns = handler.getCSVColumns();
    const headers = columns.map(c => c.name).join(',');
    const examples = columns.map(c => c.example).join(',');

    return `${headers}\n${examples}\n`;
  }

  /**
   * Helper: Convert string to URL-friendly slug
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-');
  }
}
```

---

## Context Implementation

### HandlerContext Implementation

**File: `src/handlers/HandlerContextImpl.ts`**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { parse as parseCSV } from 'csv-parse/sync';
import {
  HandlerContext,
  Logger,
  H5PPackageBuilder,
  CSVParseOptions,
  LogLevel
} from './ContentHandler';

/**
 * Concrete implementation of HandlerContext.
 * Provides shared utilities to all handlers.
 */
export class HandlerContextImpl implements HandlerContext {
  readonly workDir: string;
  readonly logger: Logger;
  readonly packageBuilder: H5PPackageBuilder;
  
  private fileCounter: Map<string, number> = new Map();

  constructor(
    workDir: string,
    logger: Logger,
    packageBuilder: H5PPackageBuilder
  ) {
    this.workDir = workDir;
    this.logger = logger;
    this.packageBuilder = packageBuilder;
  }

  /**
   * Copy a file to the H5P package structure.
   * Handles directory creation, filename collisions, and validation.
   */
  copyFile(sourcePath: string, destSubDir: string): string {
    // Validate source file exists
    if (!this.validateFile(sourcePath)) {
      throw new Error(`Source file not found: ${sourcePath}`);
    }

    // Determine destination
    const contentDir = path.join(this.workDir, 'content', destSubDir);
    
    // Ensure destination directory exists
    if (!fs.existsSync(contentDir)) {
      fs.mkdirSync(contentDir, { recursive: true });
      this.logger.debug(`Created directory: ${contentDir}`);
    }

    // Get base filename
    const originalFilename = path.basename(sourcePath);
    let filename = originalFilename;
    let destPath = path.join(contentDir, filename);

    // Handle filename collisions
    let counter = 1;
    while (fs.existsSync(destPath)) {
      const ext = path.extname(originalFilename);
      const base = path.basename(originalFilename, ext);
      filename = `${base}-${counter}${ext}`;
      destPath = path.join(contentDir, filename);
      counter++;
    }

    // Copy file
    try {
      fs.copyFileSync(sourcePath, destPath);
      this.logger.debug(`Copied: ${sourcePath} → ${destPath}`);
      return filename;
    } catch (error: any) {
      throw new Error(
        `Failed to copy file ${sourcePath}: ${error.message}`
      );
    }
  }

  /**
   * Get MIME type based on file extension.
   */
  getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    
    const mimeTypes: Record<string, string> = {
      // Images
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.bmp': 'image/bmp',
      '.ico': 'image/x-icon',
      
      // Audio
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4',
      '.aac': 'audio/aac',
      '.flac': 'audio/flac',
      
      // Video
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.ogv': 'video/ogg',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      
      // Documents
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.xml': 'application/xml',
      
      // Archives
      '.zip': 'application/zip',
      '.tar': 'application/x-tar',
      '.gz': 'application/gzip'
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Validate that a file exists and is accessible.
   */
  validateFile(filePath: string): boolean {
    try {
      const stats = fs.statSync(filePath);
      return stats.isFile();
    } catch {
      return false;
    }
  }

  /**
   * Generate a unique filename using timestamp and random suffix.
   */
  generateUniqueFilename(originalName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const ext = path.extname(originalName);
    const base = path.basename(originalName, ext);
    
    return `${base}-${timestamp}-${random}${ext}`;
  }

  /**
   * Parse CSV file with configurable options.
   */
  parseCSVFile(csvPath: string, options?: CSVParseOptions): any[] {
    if (!this.validateFile(csvPath)) {
      throw new Error(`CSV file not found: ${csvPath}`);
    }

    const content = fs.readFileSync(csvPath, 'utf-8');
    
    const parseOptions = {
      delimiter: options?.delimiter || ',',
      columns: options?.headers !== false,
      skip_empty_lines: options?.skipEmptyLines !== false,
      trim: options?.trim !== false,
      relax_column_count: true, // Allow varying column counts
      cast: true, // Auto-cast types
      cast_date: false // Don't auto-parse dates
    };

    try {
      const records = parseCSV(content, parseOptions);
      this.logger.info(`Parsed ${records.length} rows from ${csvPath}`);
      return records;
    } catch (error: any) {
      throw new Error(
        `Failed to parse CSV ${csvPath}: ${error.message}`
      );
    }
  }

  /**
   * Log a message with specified level.
   */
  log(message: string, level: LogLevel = 'info'): void {
    this.logger[level](message);
  }

  /**
   * Get relative path within content directory.
   * Useful for constructing paths in content.json.
   */
  getRelativeContentPath(filePath: string): string {
    const contentDir = path.join(this.workDir, 'content');
    return path.relative(contentDir, filePath);
  }

  /**
   * Check if file is an image.
   */
  isImageFile(filename: string): boolean {
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
    const ext = path.extname(filename).toLowerCase();
    return imageExts.includes(ext);
  }

  /**
   * Check if file is an audio file.
   */
  isAudioFile(filename: string): boolean {
    const audioExts = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
    const ext = path.extname(filename).toLowerCase();
    return audioExts.includes(ext);
  }

  /**
   * Check if file is a video file.
   */
  isVideoFile(filename: string): boolean {
    const videoExts = ['.mp4', '.webm', '.ogv', '.avi', '.mov'];
    const ext = path.extname(filename).toLowerCase();
    return videoExts.includes(ext);
  }

  /**
   * Get file size in bytes.
   */
  getFileSize(filePath: string): number {
    try {
      const stats = fs.statSync(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  /**
   * Format file size as human-readable string.
   */
  formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}
```

### Simple Logger Implementation

**File: `src/handlers/SimpleLogger.ts`**

```typescript
import { Logger } from './ContentHandler';

/**
 * Simple console-based logger implementation.
 * Can be extended for file logging, structured logging, etc.
 */
export class SimpleLogger implements Logger {
  private enableDebug: boolean;

  constructor(enableDebug: boolean = false) {
    this.enableDebug = enableDebug;
  }

  info(message: string): void {
    console.log(`ℹ️  ${message}`);
  }

  warn(message: string): void {
    console.warn(`⚠️  ${message}`);
  }

  error(message: string): void {
    console.error(`❌ ${message}`);
  }

  debug(message: string): void {
    if (this.enableDebug) {
      console.log(`🔍 ${message}`);
    }
  }
}
```

---

## Example Handler Implementations

### 1. Interactive Book Handler (New)

**File: `src/handlers/InteractiveBookHandler.ts`**

```typescript
import * as path from 'path';
import {
  ContentHandler,
  HandlerContext,
  ValidationResult,
  H5PContent,
  CSVColumnDefinition,
  CLIOption
} from './ContentHandler';

/**
 * Handler for H5P.InteractiveBook content type.
 * Supports digital storybooks with text, images, and audio.
 */
export class InteractiveBookHandler implements ContentHandler {
  readonly type = 'interactivebook';
  readonly displayName = 'Interactive Book';
  readonly description = 'Create digital storybooks with text, images, and audio narration';
  readonly libraryName = 'H5P.InteractiveBook';

  validate(data: InteractiveBookData): ValidationResult {
    const errors: any[] = [];

    // Validate book title
    if (!data.bookTitle || typeof data.bookTitle !== 'string') {
      errors.push({
        field: 'bookTitle',
        message: 'Book title is required',
        value: data.bookTitle
      });
    }

    // Validate pages exist
    if (!data.pages || !Array.isArray(data.pages) || data.pages.length === 0) {
      errors.push({
        field: 'pages',
        message: 'At least one page is required',
        value: data.pages
      });
    }

    // Validate each page
    if (data.pages && Array.isArray(data.pages)) {
      data.pages.forEach((page, index) => {
        if (!page.pageTitle) {
          errors.push({
            field: `pages[${index}].pageTitle`,
            message: `Page ${index + 1}: Title is required`,
            value: page.pageTitle
          });
        }

        if (!page.pageText) {
          errors.push({
            field: `pages[${index}].pageText`,
            message: `Page ${index + 1}: Text content is required`,
            value: page.pageText
          });
        }
      });
    }

    return {
      valid: errors.length === 0,
      error: errors.length > 0 
        ? `Validation failed with ${errors.length} error(s)` 
        : undefined,
      errors
    };
  }

  async generate(data: InteractiveBookData, context: HandlerContext): Promise<H5PContent> {
    context.log(`Generating Interactive Book: ${data.bookTitle}`);

    const chapters: any[] = [];

    for (let i = 0; i < data.pages.length; i++) {
      const page = data.pages[i];
      context.log(`Processing page ${i + 1}/${data.pages.length}: ${page.pageTitle}`);
      
      const chapter = await this.createChapter(page, context);
      chapters.push(chapter);
    }

    return {
      chapters,
      bookCover: data.coverImage ? {
        coverImage: data.coverImage,
        coverDescription: data.coverDescription || ''
      } : undefined,
      metadata: {
        title: data.bookTitle,
        contentType: 'Interactive Book',
        license: 'U',
        defaultLanguage: data.language || 'en'
      }
    };
  }

  private async createChapter(page: PageData, context: HandlerContext): Promise<any> {
    const content: any[] = [];

    // Add text content
    const textHtml = this.buildTextHtml(page.pageTitle, page.pageText);
    content.push({
      content: {
        library: 'H5P.AdvancedText 1.1',
        params: {
          text: textHtml
        }
      }
    });

    // Add image if provided
    if (page.imagePath) {
      try {
        const imageContent = await this.createImageContent(
          page.imagePath,
          page.imageAlt || page.pageTitle,
          context
        );
        content.push(imageContent);
      } catch (error: any) {
        context.log(
          `Warning: Failed to add image for page "${page.pageTitle}": ${error.message}`,
          'warn'
        );
      }
    }

    // Add audio if provided
    if (page.audioPath) {
      try {
        const audioContent = await this.createAudioContent(
          page.audioPath,
          context
        );
        content.push(audioContent);
      } catch (error: any) {
        context.log(
          `Warning: Failed to add audio for page "${page.pageTitle}": ${error.message}`,
          'warn'
        );
      }
    }

    return {
      item: {
        content
      }
    };
  }

  private buildTextHtml(title: string, text: string): string {
    let html = '';
    
    if (title) {
      html += `<h2>${this.escapeHtml(title)}</h2>\n`;
    }
    
    // Convert line breaks to paragraphs
    const paragraphs = text.split('\n\n').filter(p => p.trim());
    for (const para of paragraphs) {
      html += `<p>${this.escapeHtml(para.trim())}</p>\n`;
    }
    
    return html;
  }

  private async createImageContent(
    imagePath: string,
    alt: string,
    context: HandlerContext
  ): Promise<any> {
    if (!context.validateFile(imagePath)) {
      throw new Error(`Image file not found: ${imagePath}`);
    }

    const filename = context.copyFile(imagePath, 'images');
    const mimeType = context.getMimeType(filename);

    return {
      content: {
        library: 'H5P.Image 1.1',
        params: {
          contentName: 'Image',
          file: {
            path: `images/${filename}`,
            mime: mimeType,
            copyright: { license: 'U' }
          },
          alt: alt,
          decorative: false
        }
      }
    };
  }

  private async createAudioContent(
    audioPath: string,
    context: HandlerContext
  ): Promise<any> {
    if (!context.validateFile(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const filename = context.copyFile(audioPath, 'audios');
    const mimeType = context.getMimeType(filename);

    return {
      content: {
        library: 'H5P.Audio 1.5',
        params: {
          contentName: 'Audio',
          files: [{
            path: `audios/${filename}`,
            mime: mimeType,
            copyright: { license: 'U' }
          }],
          playerMode: 'minimalistic',
          fitToWrapper: false,
          controls: true,
          autoplay: false
        }
      }
    };
  }

  async parseCSV(csvPath: string): Promise<InteractiveBookData> {
    const context = this.getTempContext();
    const rows = context.parseCSVFile(csvPath);

    if (rows.length === 0) {
      throw new Error('CSV file is empty');
    }

    // First row determines book-level data
    const firstRow = rows[0];
    const bookData: InteractiveBookData = {
      bookTitle: firstRow.bookTitle,
      language: firstRow.language || 'en',
      coverImage: firstRow.coverImage,
      coverDescription: firstRow.coverDescription,
      pages: []
    };

    // Each row is a page
    for (const row of rows) {
      bookData.pages.push({
        pageTitle: row.pageTitle,
        pageText: row.pageText,
        imagePath: row.imagePath,
        imageAlt: row.imageAlt,
        audioPath: row.audioPath
      });
    }

    return bookData;
  }

  getCSVColumns(): CSVColumnDefinition[] {
    return [
      {
        name: 'bookTitle',
        required: true,
        description: 'Title of the entire book',
        example: 'My Story Book',
        type: 'string'
      },
      {
        name: 'language',
        required: false,
        description: 'Language code (en, es, fr, etc.)',
        example: 'en',
        type: 'string',
        defaultValue: 'en'
      },
      {
        name: 'pageTitle',
        required: true,
        description: 'Title of this page/chapter',
        example: 'Chapter 1: The Beginning',
        type: 'string'
      },
      {
        name: 'pageText',
        required: true,
        description: 'Main text content for this page',
        example: 'Once upon a time...',
        type: 'string'
      },
      {
        name: 'imagePath',
        required: false,
        description: 'Path to image file for this page',
        example: './images/chapter1.jpg',
        type: 'path'
      },
      {
        name: 'imageAlt',
        required: false,
        description: 'Alt text for image (accessibility)',
        example: 'A peaceful forest scene',
        type: 'string'
      },
      {
        name: 'audioPath',
        required: false,
        description: 'Path to audio narration file',
        example: './audio/chapter1.mp3',
        type: 'path'
      },
      {
        name: 'coverImage',
        required: false,
        description: 'Book cover image (first row only)',
        example: './images/cover.jpg',
        type: 'path'
      },
      {
        name: 'coverDescription',
        required: false,
        description: 'Book cover description (first row only)',
        example: 'A magical adventure awaits',
        type: 'string'
      }
    ];
  }

  getCLIOptions(): CLIOption[] {
    return [
      {
        flags: '-l, --language <code>',
        description: 'Language code (en, es, fr, etc.)',
        defaultValue: 'en'
      },
      {
        flags: '-t, --title <title>',
        description: 'Override book title from CSV'
      },
      {
        flags: '--cover <path>',
        description: 'Path to cover image'
      }
    ];
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private getTempContext(): HandlerContext {
    // For CSV parsing, we need a minimal context
    // This will be replaced with actual context during generation
    return {
      workDir: '',
      logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      packageBuilder: {} as any,
      parseCSVFile: (csvPath: string) => {
        const fs = require('fs');
        const { parse } = require('csv-parse/sync');
        const content = fs.readFileSync(csvPath, 'utf-8');
        return parse(content, { columns: true, skip_empty_lines: true });
      }
    } as any;
  }
}

// Type definitions for Interactive Book
interface InteractiveBookData {
  bookTitle: string;
  language: string;
  coverImage?: string;
  coverDescription?: string;
  pages: PageData[];
}

interface PageData {
  pageTitle: string;
  pageText: string;
  imagePath?: string;
  imageAlt?: string;
  audioPath?: string;
}
```

### 2. Flashcards Handler (Refactored)

**File: `src/handlers/FlashcardsHandler.ts`**

```typescript
import {
  ContentHandler,
  HandlerContext,
  ValidationResult,
  H5PContent,
  CSVColumnDefinition,
  CLIOption
} from './ContentHandler';

/**
 * Handler for H5P.Flashcards content type.
 * Refactored from original Flashcards.ts to use handler pattern.
 */
export class FlashcardsHandler implements ContentHandler {
  readonly type = 'flashcards';
  readonly displayName = 'Flashcards';
  readonly description = 'Create flashcard sets for memorization and study';
  readonly libraryName = 'H5P.Flashcards';

  validate(data: FlashcardsData): ValidationResult {
    const errors: any[] = [];

    if (!data.title || typeof data.title !== 'string') {
      errors.push({
        field: 'title',
        message: 'Flashcard set title is required',
        value: data.title
      });
    }

    if (!data.cards || !Array.isArray(data.cards) || data.cards.length === 0) {
      errors.push({
        field: 'cards',
        message: 'At least one flashcard is required',
        value: data.cards
      });
    }

    if (data.cards) {
      data.cards.forEach((card, index) => {
        if (!card.question) {
          errors.push({
            field: `cards[${index}].question`,
            message: `Card ${index + 1}: Question is required`,
            value: card.question
          });
        }
        if (!card.answer) {
          errors.push({
            field: `cards[${index}].answer`,
            message: `Card ${index + 1}: Answer is required`,
            value: card.answer
          });
        }
      });
    }

    return {
      valid: errors.length === 0,
      error: errors.length > 0 
        ? `Validation failed with ${errors.length} error(s)` 
        : undefined,
      errors
    };
  }

  async generate(data: FlashcardsData, context: HandlerContext): Promise<H5PContent> {
    context.log(`Generating flashcard set: ${data.title}`);

    const cards = [];

    for (let i = 0; i < data.cards.length; i++) {
      const card = data.cards[i];
      context.log(`Processing card ${i + 1}/${data.cards.length}`);

      const h5pCard: any = {
        text: card.question,
        answer: card.answer
      };

      // Add tip if provided
      if (card.tip) {
        h5pCard.tip = card.tip;
      }

      // Add image if provided
      if (card.image) {
        try {
          if (card.image.startsWith('http://') || card.image.startsWith('https://')) {
            // External URL
            h5pCard.image = {
              path: card.image,
              mime: 'image/jpeg' // Assume JPEG for URLs
            };
          } else {
            // Local file
            const filename = context.copyFile(card.image, 'images');
            h5pCard.image = {
              path: `images/${filename}`,
              mime: context.getMimeType(filename)
            };
          }
        } catch (error: any) {
          context.log(
            `Warning: Failed to add image for card "${card.question}": ${error.message}`,
            'warn'
          );
        }
      }

      cards.push(h5pCard);
    }

    return {
      description: data.description || '',
      progressText: 'Card @card of @total',
      next: 'Next',
      previous: 'Previous',
      checkAnswer: 'Check answer',
      showSolution: 'Show solution',
      retry: 'Retry',
      cards
    };
  }

  async parseCSV(csvPath: string): Promise<FlashcardsData> {
    const context = this.getTempContext();
    const rows = context.parseCSVFile(csvPath);

    if (rows.length === 0) {
      throw new Error('CSV file is empty');
    }

    const firstRow = rows[0];
    const flashcardsData: FlashcardsData = {
      title: firstRow.title || 'Flashcards',
      description: firstRow.description,
      cards: []
    };

    for (const row of rows) {
      flashcardsData.cards.push({
        question: row.question,
        answer: row.answer,
        tip: row.tip,
        image: row.image
      });
    }

    return flashcardsData;
  }

  getCSVColumns(): CSVColumnDefinition[] {
    return [
      {
        name: 'question',
        required: true,
        description: 'Question or prompt text',
        example: 'What is H5P?',
        type: 'string'
      },
      {
        name: 'answer',
        required: true,
        description: 'Answer text',
        example: 'HTML5 Package',
        type: 'string'
      },
      {
        name: 'tip',
        required: false,
        description: 'Optional hint or tip',
        example: 'Think about HTML and packaging',
        type: 'string'
      },
      {
        name: 'image',
        required: false,
        description: 'Image path or URL',
        example: './images/h5p-logo.png',
        type: 'path'
      },
      {
        name: 'title',
        required: false,
        description: 'Flashcard set title (first row)',
        example: 'H5P Vocabulary',
        type: 'string'
      },
      {
        name: 'description',
        required: false,
        description: 'Set description (first row)',
        example: 'Learn H5P terms',
        type: 'string'
      }
    ];
  }

  getCLIOptions(): CLIOption[] {
    return [
      {
        flags: '-l, --language <code>',
        description: 'Language code',
        defaultValue: 'en'
      },
      {
        flags: '-t, --title <title>',
        description: 'Flashcard set title'
      },
      {
        flags: '-d, --description <text>',
        description: 'Description shown when studying'
      }
    ];
  }

  private getTempContext(): HandlerContext {
    return {
      parseCSVFile: (csvPath: string) => {
        const fs = require('fs');
        const { parse } = require('csv-parse/sync');
        const content = fs.readFileSync(csvPath, 'utf-8');
        return parse(content, { columns: true, skip_empty_lines: true });
      }
    } as any;
  }
}

interface FlashcardsData {
  title: string;
  description?: string;
  cards: FlashcardItem[];
}

interface FlashcardItem {
  question: string;
  answer: string;
  tip?: string;
  image?: string;
}
```

### 3. Dialog Cards Handler (Refactored)

**File: `src/handlers/DialogCardsHandler.ts`**

```typescript
import {
  ContentHandler,
  HandlerContext,
  ValidationResult,
  H5PContent,
  CSVColumnDefinition,
  CLIOption
} from './ContentHandler';

/**
 * Handler for H5P.DialogCards content type.
 */
export class DialogCardsHandler implements ContentHandler {
  readonly type = 'dialogcards';
  readonly displayName = 'Dialog Cards';
  readonly description = 'Create two-sided dialog cards with text, images, and audio';
  readonly libraryName = 'H5P.DialogCards';

  validate(data: DialogCardsData): ValidationResult {
    const errors: any[] = [];

    if (!data.cards || !Array.isArray(data.cards) || data.cards.length === 0) {
      errors.push({
        field: 'cards',
        message: 'At least one card is required',
        value: data.cards
      });
    }

    if (data.cards) {
      data.cards.forEach((card, index) => {
        if (!card.text) {
          errors.push({
            field: `cards[${index}].text`,
            message: `Card ${index + 1}: Front text is required`,
            value: card.text
          });
        }
        if (!card.answer) {
          errors.push({
            field: `cards[${index}].answer`,
            message: `Card ${index + 1}: Back text is required`,
            value: card.answer
          });
        }
      });
    }

    return {
      valid: errors.length === 0,
      error: errors.length > 0 
        ? `Validation failed with ${errors.length} error(s)` 
        : undefined,
      errors
    };
  }

  async generate(data: DialogCardsData, context: HandlerContext): Promise<H5PContent> {
    context.log(`Generating dialog cards: ${data.title || 'Dialog Cards'}`);

    const dialogs = [];

    for (let i = 0; i < data.cards.length; i++) {
      const card = data.cards[i];
      context.log(`Processing card ${i + 1}/${data.cards.length}`);

      const dialog: any = {
        text: card.text,
        answer: card.answer
      };

      // Add image if provided
      if (card.image) {
        try {
          if (card.image.startsWith('http://') || card.image.startsWith('https://')) {
            dialog.image = { path: card.image };
          } else {
            const filename = context.copyFile(card.image, 'images');
            dialog.image = {
              path: `images/${filename}`,
              mime: context.getMimeType(filename)
            };
          }
        } catch (error: any) {
          context.log(
            `Warning: Failed to add image for card: ${error.message}`,
            'warn'
          );
        }
      }

      // Add audio if provided
      if (card.audio) {
        try {
          if (card.audio.startsWith('http://') || card.audio.startsWith('https://')) {
            dialog.audio = { path: card.audio };
          } else {
            const filename = context.copyFile(card.audio, 'audios');
            dialog.audio = {
              path: `audios/${filename}`,
              mime: context.getMimeType(filename)
            };
          }
        } catch (error: any) {
          context.log(
            `Warning: Failed to add audio for card: ${error.message}`,
            'warn'
          );
        }
      }

      dialogs.push(dialog);
    }

    return {
      title: data.title || 'Dialog Cards',
      mode: data.mode || 'normal',
      description: data.description || 'Flip the cards to see answers',
      next: 'Next',
      prev: 'Previous',
      retry: 'Retry',
      dialogs
    };
  }

  async parseCSV(csvPath: string): Promise<DialogCardsData> {
    const context = this.getTempContext();
    const rows = context.parseCSVFile(csvPath);

    if (rows.length === 0) {
      throw new Error('CSV file is empty');
    }

    const firstRow = rows[0];
    const dialogData: DialogCardsData = {
      title: firstRow.title || 'Dialog Cards',
      description: firstRow.description,
      mode: firstRow.mode || 'normal',
      cards: []
    };

    for (const row of rows) {
      dialogData.cards.push({
        text: row.text,
        answer: row.answer,
        image: row.image,
        audio: row.audio
      });
    }

    return dialogData;
  }

  getCSVColumns(): CSVColumnDefinition[] {
    return [
      {
        name: 'text',
        required: true,
        description: 'Front side text',
        example: 'Hello',
        type: 'string'
      },
      {
        name: 'answer',
        required: true,
        description: 'Back side text',
        example: 'Bonjour',
        type: 'string'
      },
      {
        name: 'image',
        required: false,
        description: 'Image path or URL',
        example: './images/hello.jpg',
        type: 'path'
      },
      {
        name: 'audio',
        required: false,
        description: 'Audio file path or URL',
        example: './audio/hello.mp3',
        type: 'path'
      },
      {
        name: 'title',
        required: false,
        description: 'Card set title (first row)',
        example: 'French Greetings',
        type: 'string'
      },
      {
        name: 'description',
        required: false,
        description: 'Set description (first row)',
        example: 'Learn common French greetings',
        type: 'string'
      },
      {
        name: 'mode',
        required: false,
        description: 'Display mode: normal or repetition',
        example: 'normal',
        type: 'string',
        defaultValue: 'normal'
      }
    ];
  }

  getCLIOptions(): CLIOption[] {
    return [
      {
        flags: '-l, --language <code>',
        description: 'Language code',
        defaultValue: 'en'
      },
      {
        flags: '-n, --name <name>',
        description: 'Card set title'
      },
      {
        flags: '-m, --mode <mode>',
        description: 'Mode: normal or repetition',
        defaultValue: 'normal'
      }
    ];
  }

  private getTempContext(): HandlerContext {
    return {
      parseCSVFile: (csvPath: string) => {
        const fs = require('fs');
        const { parse } = require('csv-parse/sync');
        const content = fs.readFileSync(csvPath, 'utf-8');
        return parse(content, { columns: true, skip_empty_lines: true });
      }
    } as any;
  }
}

interface DialogCardsData {
  title: string;
  description?: string;
  mode: string;
  cards: DialogCard[];
}

interface DialogCard {
  text: string;
  answer: string;
  image?: string;
  audio?: string;
}
```

---

## CLI Integration

### Updated CLI Entry Point

**File: `src/index.ts`**

```typescript
import { Command } from 'commander';
import { HandlerRegistry } from './handlers/HandlerRegistry';
import { HandlerContextImpl } from './handlers/HandlerContextImpl';
import { SimpleLogger } from './handlers/SimpleLogger';
import { H5pPackageBuilder } from './H5pPackageBuilder';

// Import handlers
import { InteractiveBookHandler } from './handlers/InteractiveBookHandler';
import { FlashcardsHandler } from './handlers/FlashcardsHandler';
import { DialogCardsHandler } from './handlers/DialogCardsHandler';

const program = new Command();

// Setup
const logger = new SimpleLogger(process.env.DEBUG === 'true');
const registry = new HandlerRegistry(logger);

// Register all handlers
registry.register(new InteractiveBookHandler());
registry.register(new FlashcardsHandler());
registry.register(new DialogCardsHandler());

// Dynamic command generation
for (const handler of registry.getAll()) {
  const command = program
    .command(`${handler.type} <input> <output>`)
    .description(handler.description);

  // Add handler-specific options
  for (const option of handler.getCLIOptions()) {
    command.option(option.flags, option.description, option.defaultValue);
  }

  // Add common options
  command
    .option('--debug', 'Enable debug logging', false)
    .action(async (input: string, output: string, options: any) => {
      try {
        logger.info(`\n🚀 Starting ${handler.displayName} generation\n`);

        // Parse CSV
        const data = await handler.parseCSV(input);

        // Validate
        const validation = handler.validate(data);
        if (!validation.valid) {
          logger.error(`❌ Validation failed: ${validation.error}`);
          if (validation.errors) {
            validation.errors.forEach(err => {
              logger.error(`  - ${err.field}: ${err.message}`);
            });
          }
          process.exit(1);
        }

        // Setup H5P package builder
        const templatePath = `./templates/${handler.type}-template.h5p`;
        const packageBuilder = new H5pPackageBuilder(templatePath);
        const workDir = await packageBuilder.extractTemplate();

        // Create context
        const context = new HandlerContextImpl(workDir, logger, packageBuilder);

        // Generate content
        const h5pContent = await handler.generate(data, context);

        // Load and update content.json
        const contentJson = packageBuilder.loadContent(workDir);
        Object.assign(contentJson, h5pContent);
        packageBuilder.saveContent(workDir, contentJson);

        // Update h5p.json metadata
        packageBuilder.updateH5pJson(workDir, {
          title: options.title || data.title || data.bookTitle,
          language: options.language || data.language || 'en'
        });

        // Package as .h5p
        await packageBuilder.packageH5P(workDir, output);

        // Cleanup
        if (handler.cleanup) {
          await handler.cleanup();
        }
        packageBuilder.cleanup(workDir);

        logger.info(`\n✅ Successfully generated: ${output}\n`);
      } catch (error: any) {
        logger.error(`\n❌ Error: ${error.message}\n`);
        if (options.debug) {
          console.error(error.stack);
        }
        process.exit(1);
      }
    });
}

// Add documentation command
program
  .command('docs')
  .description('Generate CSV format documentation')
  .option('-o, --output <file>', 'Output file', 'CSV_FORMAT.md')
  .action((options) => {
    const docs = registry.generateCSVDocumentation();
    require('fs').writeFileSync(options.output, docs);
    logger.info(`✅ Documentation written to: ${options.output}`);
  });

// Add list command
program
  .command('list')
  .description('List available content types')
  .action(() => {
    console.log(registry.generateCommandList());
  });

// Add template command
program
  .command('template <type>')
  .description('Generate CSV template for a content type')
  .option('-o, --output <file>', 'Output file')
  .action((type, options) => {
    try {
      const template = registry.generateCSVTemplate(type);
      const outputFile = options.output || `${type}-template.csv`;
      require('fs').writeFileSync(outputFile, template);
      logger.info(`✅ Template written to: ${outputFile}`);
    } catch (error: any) {
      logger.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }
  });

program.parse(process.argv);
```

---

## Testing Strategy

### Unit Tests for Handlers

**File: `tests/handlers/InteractiveBookHandler.test.ts`**

```typescript
import { InteractiveBookHandler } from '../../src/handlers/InteractiveBookHandler';
import { HandlerContextImpl } from '../../src/handlers/HandlerContextImpl';
import { SimpleLogger } from '../../src/handlers/SimpleLogger';

describe('InteractiveBookHandler', () => {
  let handler: InteractiveBookHandler;
  
  beforeEach(() => {
    handler = new InteractiveBookHandler();
  });

  describe('validate()', () => {
    it('should validate correct data', () => {
      const data = {
        bookTitle: 'My Book',
        language: 'en',
        pages: [
          {
            pageTitle: 'Page 1',
            pageText: 'Content'
          }
        ]
      };

      const result = handler.validate(data);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject missing bookTitle', () => {
      const data = {
        pages: [
          { pageTitle: 'Page 1', pageText: 'Content' }
        ]
      };

      const result = handler.validate(data as any);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].field).toBe('bookTitle');
    });

    it('should reject empty pages array', () => {
      const data = {
        bookTitle: 'My Book',
        pages: []
      };

      const result = handler.validate(data);
      expect(result.valid).toBe(false);
    });
  });

  describe('getCSVColumns()', () => {
    it('should return column definitions', () => {
      const columns = handler.getCSVColumns();
      expect(columns.length).toBeGreaterThan(0);
      
      const requiredColumns = columns.filter(c => c.required);
      expect(requiredColumns.length).toBeGreaterThan(0);
    });
  });

  describe('getCLIOptions()', () => {
    it('should return CLI options', () => {
      const options = handler.getCLIOptions();
      expect(options.length).toBeGreaterThan(0);
    });
  });
});
```

### Integration Tests

**File: `tests/integration/handler-workflow.test.ts`**

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { HandlerRegistry } from '../../src/handlers/HandlerRegistry';
import { InteractiveBookHandler } from '../../src/handlers/InteractiveBookHandler';
import { SimpleLogger } from '../../src/handlers/SimpleLogger';

describe('Handler Workflow Integration', () => {
  let registry: HandlerRegistry;
  let testDir: string;

  beforeEach(() => {
    const logger = new SimpleLogger(false);
    registry = new HandlerRegistry(logger);
    testDir = fs.mkdtempSync(path.join(__dirname, 'test-'));
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should complete full workflow for interactive book', async () => {
    // Register handler
    const handler = new InteractiveBookHandler();
    registry.register(handler);

    // Create test CSV
    const csvPath = path.join(testDir, 'test.csv');
    const csvContent = 
      'bookTitle,pageTitle,pageText\n' +
      'My Book,Page 1,First page content\n' +
      'My Book,Page 2,Second page content\n';
    fs.writeFileSync(csvPath, csvContent);

    // Parse CSV
    const data = await handler.parseCSV(csvPath);
    expect(data.pages).toHaveLength(2);

    // Validate
    const validation = handler.validate(data);
    expect(validation.valid).toBe(true);

    // Note: Full generation test would require H5P template
  });
});
```

---

## Migration Guide

### For Existing Flashcards/DialogCards Users

**No changes required!** Existing CLI commands continue to work:

```bash
# These still work exactly the same
node ./dist/index.js flashcards ./input.csv ./output.h5p -l=en
node ./dist/index.js dialogcards ./input.csv ./output.h5p -l=de
```

### For Contributors Adding New Content Types

**Before (old way):**
1. Create new file e.g., `MyContentType.ts`
2. Copy/paste from `Flashcards.ts`
3. Modify for your content type
4. Add CLI command in `index.ts`
5. Hope you didn't miss anything
6. Time: 4-8 hours

**After (handler system):**
1. Create `MyContentTypeHandler.ts`
2. Implement `ContentHandler` interface (TypeScript enforces completeness)
3. Register: `registry.register(new MyContentTypeHandler())`
4. Done!
5. Time: 30-60 minutes

### Gradual Migration Path

**Phase 1: Infrastructure (Week 1)**
- Add handler interfaces
- Create registry
- Implement context
- Add tests

**Phase 2: Refactor Existing (Week 2)**
- Refactor Flashcards → FlashcardsHandler
- Refactor DialogCards → DialogCardsHandler
- Ensure backward compatibility

**Phase 3: Add New Handler (Week 3)**
- Implement InteractiveBookHandler
- Add tests
- Update documentation

**Phase 4: Documentation & Release**
- Generate CSV format docs
- Write contributor guide
- Submit PR

---

## Documentation Templates

### Handler Development Guide

**File: `docs/HANDLER_DEVELOPMENT.md`**

```markdown
# Developing a New Content Type Handler

## Quick Start (30 minutes)

### 1. Create Handler File

Create `src/handlers/MyContentTypeHandler.ts`:

\`\`\`typescript
import {
  ContentHandler,
  HandlerContext,
  ValidationResult,
  H5PContent,
  CSVColumnDefinition,
  CLIOption
} from './ContentHandler';

export class MyContentTypeHandler implements ContentHandler {
  readonly type = 'mycontenttype'; // CLI command name
  readonly displayName = 'My Content Type';
  readonly description = 'Short description';
  readonly libraryName = 'H5P.MyContentType';

  validate(data: any): ValidationResult {
    // Validate input data
    return { valid: true };
  }

  async generate(data: any, context: HandlerContext): Promise<H5PContent> {
    // Generate H5P content structure
    return { /* H5P content.json structure */ };
  }

  async parseCSV(csvPath: string): Promise<any> {
    // Parse CSV into data object
  }

  getCSVColumns(): CSVColumnDefinition[] {
    // Define CSV columns
    return [];
  }

  getCLIOptions(): CLIOption[] {
    // Define CLI options
    return [];
  }
}
\`\`\`

### 2. Register Handler

In `src/index.ts`:

\`\`\`typescript
import { MyContentTypeHandler } from './handlers/MyContentTypeHandler';

registry.register(new MyContentTypeHandler());
\`\`\`

### 3. Create Template

1. Manually create sample content in H5P editor
2. Download as .h5p
3. Save as `templates/mycontenttype-template.h5p`

### 4. Test

\`\`\`bash
node ./dist/index.js mycontenttype ./test.csv ./output.h5p
\`\`\`

## Best Practices

- Keep handlers focused (single responsibility)
- Validate thoroughly in `validate()`
- Use context utilities for file operations
- Log progress messages
- Handle errors gracefully
- Test with various CSV formats

## Examples

See existing handlers:
- Simple: `FlashcardsHandler.ts`
- Medium: `DialogCardsHandler.ts`
- Complex: `InteractiveBookHandler.ts`
```

---

## Deployment Checklist

### Pre-Release Checklist

- [ ] All interfaces defined and documented
- [ ] Registry implementation complete
- [ ] Context implementation complete
- [ ] All three handlers implemented (Flashcards, DialogCards, InteractiveBook)
- [ ] CLI integration complete
- [ ] Unit tests written for each handler
- [ ] Integration tests pass
- [ ] Documentation generated
- [ ] Migration guide written
- [ ] Backward compatibility verified
- [ ] Templates created for all content types
- [ ] Example CSVs provided
- [ ] README updated
- [ ] CHANGELOG updated

### Post-Release Tasks

- [ ] Monitor GitHub issues for bugs
- [ ] Respond to community questions
- [ ] Accept community contributions
- [ ] Add new handlers as requested
- [ ] Keep documentation up-to-date

---

## Summary

This handler/plugin architecture brings professional software engineering practices to h5p-cli-creator:

**✅ Extensibility** - Add new content types in minutes
**✅ Maintainability** - Each handler is isolated and testable
**✅ Community-Friendly** - Clear patterns for contributions
**✅ Type-Safe** - TypeScript ensures correctness
**✅ Well-Documented** - Auto-generated docs from code
**✅ Backward Compatible** - Existing functionality preserved

**Time Investment:**
- Initial setup: 2-3 weeks
- Future handlers: 30-60 minutes each

**Return on Investment:** Enormous
- Enables community contributions
- Makes project more professional
- Reduces maintenance burden
- Increases adoption

This architecture transforms h5p-cli-creator from a utility script into a robust, extensible platform for H5P content generation.
