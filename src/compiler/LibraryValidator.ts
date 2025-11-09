import * as fsExtra from "fs-extra";
import * as path from "path";
import * as jszip from "jszip";

/**
 * Library validation result for a single library
 */
export interface LibraryValidationResult {
  libraryName: string;
  requestedVersion?: string;
  status: "ok" | "version-mismatch" | "case-mismatch" | "not-found";
  message: string;
  cacheFile?: string;
  actualVersion?: string;
}

/**
 * LibraryValidator checks for version and case mismatches between
 * required libraries and cached .h5p files BEFORE compilation starts.
 */
export class LibraryValidator {
  private cacheDir = path.resolve("content-type-cache");

  /**
   * Validates all required libraries against cached files.
   * Detects version mismatches, case mismatches, and missing libraries.
   *
   * @param requiredLibraries Array of library names (e.g., ["H5P.Flashcards", "H5P.DialogCards"])
   * @param verbose Enable detailed logging
   * @returns Array of validation results
   */
  public async validateLibraries(
    requiredLibraries: string[],
    verbose = false
  ): Promise<LibraryValidationResult[]> {
    const results: LibraryValidationResult[] = [];

    // Get all cached .h5p files
    const cacheFiles = await fsExtra.readdir(this.cacheDir);
    const h5pFiles = cacheFiles.filter(f => f.endsWith('.h5p'));

    if (verbose) {
      console.log(`\nValidating ${requiredLibraries.length} required libraries...`);
      console.log(`Found ${h5pFiles.length} cached .h5p files\n`);
    }

    for (const libName of requiredLibraries) {
      const result = await this.validateSingleLibrary(libName, h5pFiles, verbose);
      results.push(result);

      if (verbose) {
        this.logValidationResult(result);
      }
    }

    return results;
  }

  /**
   * Validates a single library against cached files
   */
  private async validateSingleLibrary(
    libraryName: string,
    cacheFiles: string[],
    verbose: boolean
  ): Promise<LibraryValidationResult> {
    // Try exact match first (case-sensitive)
    const exactMatch = cacheFiles.find(file =>
      file.startsWith(`${libraryName}-`) || file === `${libraryName}.h5p`
    );

    if (exactMatch) {
      // Found exact match - extract version if versioned
      const version = this.extractVersionFromFilename(exactMatch);
      return {
        libraryName,
        requestedVersion: version,
        status: "ok",
        message: `✓ Found exact match: ${exactMatch}`,
        cacheFile: exactMatch,
        actualVersion: version
      };
    }

    // Try case-insensitive match
    const libNameLower = libraryName.toLowerCase();
    const caseInsensitiveMatch = cacheFiles.find(file => {
      const fileLower = file.toLowerCase();
      return fileLower.startsWith(`${libNameLower}-`) || fileLower === `${libNameLower}.h5p`;
    });

    if (caseInsensitiveMatch) {
      // Found case mismatch
      const version = this.extractVersionFromFilename(caseInsensitiveMatch);
      return {
        libraryName,
        requestedVersion: version,
        status: "case-mismatch",
        message: `⚠ Case mismatch: requested "${libraryName}" but found "${caseInsensitiveMatch}"`,
        cacheFile: caseInsensitiveMatch,
        actualVersion: version
      };
    }

    // Library not found
    return {
      libraryName,
      status: "not-found",
      message: `✗ Library not found in cache (will download from Hub)`
    };
  }

  /**
   * Extracts version number from filename (e.g., "H5P.Flashcards-1.5.h5p" → "1.5")
   */
  private extractVersionFromFilename(filename: string): string | undefined {
    const match = filename.match(/-(\d+\.\d+)\.h5p$/);
    return match ? match[1] : undefined;
  }

  /**
   * Checks if handler-declared version matches cached file version
   */
  public async checkVersionMismatch(
    libraryName: string,
    declaredVersion: string
  ): Promise<{ match: boolean; cacheVersion?: string; cacheFile?: string }> {
    const cacheFiles = await fsExtra.readdir(this.cacheDir);
    const libNameLower = libraryName.toLowerCase();

    const matchingFile = cacheFiles.find(file => {
      const fileLower = file.toLowerCase();
      return (fileLower.startsWith(`${libNameLower}-`) || fileLower === `${libNameLower}.h5p`) &&
        file.endsWith('.h5p');
    });

    if (!matchingFile) {
      return { match: false };
    }

    const cacheVersion = this.extractVersionFromFilename(matchingFile);
    if (!cacheVersion) {
      return { match: true, cacheFile: matchingFile }; // Non-versioned file, assume OK
    }

    const match = cacheVersion === declaredVersion;
    return {
      match,
      cacheVersion,
      cacheFile: matchingFile
    };
  }

  /**
   * Extracts actual version from library.json inside a cached .h5p file
   */
  public async getActualLibraryVersion(
    libraryName: string
  ): Promise<{ majorVersion?: number; minorVersion?: number; patchVersion?: number }> {
    const cacheFiles = await fsExtra.readdir(this.cacheDir);
    const libNameLower = libraryName.toLowerCase();

    const matchingFile = cacheFiles.find(file => {
      const fileLower = file.toLowerCase();
      return (fileLower.startsWith(`${libNameLower}-`) || fileLower === `${libNameLower}.h5p`) &&
        file.endsWith('.h5p');
    });

    if (!matchingFile) {
      return {};
    }

    try {
      const cachePath = path.join(this.cacheDir, matchingFile);
      const packageBuffer = await fsExtra.readFile(cachePath);
      const packageZip = await jszip.loadAsync(packageBuffer);

      // Try to find library.json in the package
      const libraryJsonFile = Object.keys(packageZip.files).find(name =>
        name.match(/^[^/]+-\d+\.\d+\/library\.json$/) || name === 'library.json'
      );

      if (libraryJsonFile) {
        const content = await packageZip.files[libraryJsonFile].async("string");
        const libraryJson = JSON.parse(content);
        return {
          majorVersion: libraryJson.majorVersion,
          minorVersion: libraryJson.minorVersion,
          patchVersion: libraryJson.patchVersion
        };
      }
    } catch (error) {
      // Ignore errors, return empty
    }

    return {};
  }

  /**
   * Logs a validation result with color-coded output
   */
  private logValidationResult(result: LibraryValidationResult): void {
    const statusSymbol = {
      "ok": "✓",
      "case-mismatch": "⚠",
      "version-mismatch": "⚠",
      "not-found": "ℹ"
    }[result.status];

    console.log(`  ${statusSymbol} ${result.libraryName}`);
    console.log(`    ${result.message}`);
    if (result.actualVersion) {
      console.log(`    Version: ${result.actualVersion}`);
    }
  }

  /**
   * Returns a summary of validation issues
   */
  public getSummary(results: LibraryValidationResult[]): {
    total: number;
    ok: number;
    caseMismatch: number;
    versionMismatch: number;
    notFound: number;
    hasIssues: boolean;
  } {
    return {
      total: results.length,
      ok: results.filter(r => r.status === "ok").length,
      caseMismatch: results.filter(r => r.status === "case-mismatch").length,
      versionMismatch: results.filter(r => r.status === "version-mismatch").length,
      notFound: results.filter(r => r.status === "not-found").length,
      hasIssues: results.some(r => r.status === "case-mismatch" || r.status === "version-mismatch")
    };
  }
}
