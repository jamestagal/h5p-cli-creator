import axios from "axios";
import * as fsExtra from "fs-extra";
import * as jszip from "jszip";
import * as path from "path";
import { toBuffer } from "../helpers";
import { LibraryMetadata, LibraryJson, LibraryDependency } from "./types";

/**
 * Library Registry manages H5P library packages from the Hub API.
 * Handles downloading, caching, metadata extraction, and dependency resolution.
 */
export class LibraryRegistry {
  private h5pHubUrl = "https://api.h5p.org/v1/";
  private cacheDir = path.resolve("content-type-cache");
  private registry: Map<string, LibraryMetadata> = new Map();
  private resolutionInProgress: Set<string> = new Set();
  private packageCache: Map<string, jszip> = new Map();

  /**
   * Fetches a library using cache-first strategy with version support.
   * Priority: 1) Local cache, 2) Extract from parent, 3) Download from Hub
   *
   * Supports versioned cache filenames (e.g., H5P.MultiChoice-1.16.h5p)
   * Falls back to non-versioned names for backward compatibility
   *
   * @param name The machine name of the library (e.g., "H5P.InteractiveBook")
   * @param preferredVersion Optional version to prefer (format: "1.16" or "1.16.14")
   * @returns Library metadata including semantics
   */
  public async fetchLibrary(name: string, preferredVersion?: string): Promise<LibraryMetadata> {
    await fsExtra.ensureDir(this.cacheDir);

    // Strategy 1: Try cache first (fastest, most reliable)
    const cachedLibrary = await this.tryLoadFromCache(name, preferredVersion);
    if (cachedLibrary) {
      return cachedLibrary;
    }

    // Strategy 2: Try extracting from parent package (if available)
    // This handles bundled dependencies like FontAwesome, H5P.JoubelUI, etc.
    try {
      const extractedLibrary = await this.tryExtractFromParent(name);
      if (extractedLibrary) {
        // Cache the extracted library for future use
        await this.cacheLibrary(extractedLibrary);
        return extractedLibrary;
      }
    } catch (error) {
      // Parent extraction failed, continue to Hub download
    }

    // Strategy 3: Download from Hub as last resort
    try {
      console.log(`  Downloading ${name} from H5P Hub...`);
      const dataBuffer = toBuffer(await this.downloadLibraryFromHub(name));
      const metadata = await this.extractLibraryMetadata(name, dataBuffer);

      // Save to cache with version number for future use
      const versionedFilename = `${name}-${metadata.majorVersion}.${metadata.minorVersion}.h5p`;
      const localPath = path.join(this.cacheDir, versionedFilename);
      await fsExtra.writeFile(localPath, dataBuffer);
      console.log(`  Cached as ${versionedFilename}`);

      this.registry.set(this.getLibraryKey(metadata), metadata);
      return metadata;
    } catch (error) {
      throw new Error(
        `Failed to fetch library ${name}: Not in cache, not in parent package, Hub download failed. ` +
        `Error: ${error.message}`
      );
    }
  }

  /**
   * Tries to load library from local cache.
   * Checks for versioned filenames first, then falls back to non-versioned.
   * @param name Library machine name
   * @param preferredVersion Optional preferred version
   * @returns Library metadata if found in cache, null otherwise
   */
  private async tryLoadFromCache(name: string, preferredVersion?: string): Promise<LibraryMetadata | null> {
    // Check for versioned cache files (e.g., H5P.MultiChoice-1.16.h5p)
    const cacheFiles = await fsExtra.readdir(this.cacheDir);
    const matchingFiles = cacheFiles.filter(file =>
      file.startsWith(`${name}-`) && file.endsWith('.h5p')
    );

    // If preferred version specified, try exact match first
    if (preferredVersion && matchingFiles.length > 0) {
      const versionPattern = preferredVersion.replace(/\./g, '\\.');
      const exactMatch = matchingFiles.find(file =>
        file.match(new RegExp(`${name}-${versionPattern}(\\.\\d+)?\\.h5p`))
      );
      if (exactMatch) {
        return await this.loadCachedLibrary(path.join(this.cacheDir, exactMatch), name);
      }
    }

    // Try latest version if multiple versions exist
    if (matchingFiles.length > 0) {
      // Sort by version (descending) and take latest
      const sortedFiles = matchingFiles.sort((a, b) => {
        const versionA = a.match(/(\d+)\.(\d+)/);
        const versionB = b.match(/(\d+)\.(\d+)/);
        if (!versionA || !versionB) return 0;
        const majorDiff = parseInt(versionB[1]) - parseInt(versionA[1]);
        if (majorDiff !== 0) return majorDiff;
        return parseInt(versionB[2]) - parseInt(versionA[2]);
      });

      return await this.loadCachedLibrary(path.join(this.cacheDir, sortedFiles[0]), name);
    }

    // Fall back to non-versioned filename for backward compatibility
    const legacyPath = path.join(this.cacheDir, `${name}.h5p`);
    if (await fsExtra.pathExists(legacyPath)) {
      return await this.loadCachedLibrary(legacyPath, name);
    }

    return null;
  }

  /**
   * Loads and extracts metadata from a cached library file.
   * @param filePath Path to cached .h5p file
   * @param name Library machine name
   * @returns Library metadata
   */
  private async loadCachedLibrary(filePath: string, name: string): Promise<LibraryMetadata> {
    const dataBuffer = await fsExtra.readFile(filePath);
    console.log(`Using cached library package from ${path.basename(filePath)}`);
    const metadata = await this.extractLibraryMetadata(name, dataBuffer);
    this.registry.set(this.getLibraryKey(metadata), metadata);
    return metadata;
  }

  /**
   * Tries to extract library from parent package (for bundled dependencies).
   * @param name Library machine name
   * @returns Library metadata if extraction succeeds, null otherwise
   */
  private async tryExtractFromParent(name: string): Promise<LibraryMetadata | null> {
    try {
      console.log(`  ${name} not in cache, trying to extract from parent package...`);
      return await this.extractDependencyLibraryFromParent(name);
    } catch (error) {
      return null;
    }
  }

  /**
   * Caches an extracted library to disk for future use.
   * @param metadata Library metadata to cache
   */
  private async cacheLibrary(metadata: LibraryMetadata): Promise<void> {
    const versionedFilename = `${metadata.machineName}-${metadata.majorVersion}.${metadata.minorVersion}.h5p`;
    const cachePath = path.join(this.cacheDir, versionedFilename);

    // Get the package ZIP from cache
    const packageZip = this.packageCache.get(metadata.machineName);
    if (packageZip) {
      const buffer = await packageZip.generateAsync({ type: "nodebuffer" });
      await fsExtra.writeFile(cachePath, buffer);
      console.log(`  Cached extracted library as ${versionedFilename}`);
    }
  }

  /**
   * Gets a library from the registry, fetching it if not already loaded.
   * Supports both Hub content types and bundled dependency libraries.
   * @param name The machine name of the library
   * @returns Library metadata
   */
  public async getLibrary(name: string): Promise<LibraryMetadata> {
    const existing = Array.from(this.registry.values()).find(
      lib => lib.machineName === name
    );

    if (existing) {
      return existing;
    }

    try {
      return await this.fetchLibrary(name);
    } catch (error) {
      // Try extracting from parent package if:
      // 1. HTTP 404 (library not available on Hub)
      // 2. Network error (timeout, connection refused, etc.)
      if ((error.response && error.response.status === 404) || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT' || error.name === 'AggregateError') {
        console.log(`  ${name} not available on Hub, extracting from parent package...`);
        return await this.extractDependencyLibraryFromParent(name);
      }
      throw error;
    }
  }

  /**
   * Resolves all dependencies for a library recursively.
   * Handles circular dependencies by tracking resolution state.
   * @param libraryName The machine name of the library
   * @returns Array of all library metadata including the library itself and all dependencies
   */
  public async resolveDependencies(libraryName: string): Promise<LibraryMetadata[]> {
    const allDependencies: Map<string, LibraryMetadata> = new Map();

    await this.resolveDependenciesRecursive(libraryName, allDependencies);

    return Array.from(allDependencies.values());
  }

  /**
   * Downloads a library package from the H5P Hub API.
   * @param libraryName The machine name of the library
   * @returns Library package as ArrayBuffer
   */
  private async downloadLibraryFromHub(libraryName: string): Promise<ArrayBuffer> {
    console.log(`  Downloading ${libraryName} from H5P Hub...`);
    // H5P Hub API requires POST requests, not GET
    const response = await axios.post(
      this.h5pHubUrl + "content-types/" + libraryName,
      null, // No body needed for download
      {
        responseType: "arraybuffer",
        timeout: 30000 // 30 second timeout
      }
    );

    if (response.status !== 200) {
      throw new Error(`Error: Could not download library ${libraryName} from H5P Hub.`);
    }

    console.log(`  Successfully downloaded ${libraryName}`);
    return response.data;
  }

  /**
   * Extracts library metadata from a downloaded .h5p package.
   * Parses library.json and semantics.json from the package.
   * @param libraryName The machine name of the library
   * @param dataBuffer The library package buffer
   * @returns Complete library metadata
   */
  private async extractLibraryMetadata(
    libraryName: string,
    dataBuffer: Buffer
  ): Promise<LibraryMetadata> {
    const packageZip = await jszip.loadAsync(dataBuffer);
    this.packageCache.set(libraryName, packageZip);

    const h5pJsonText = await packageZip.file("h5p.json").async("text");
    const h5pJson = JSON.parse(h5pJsonText);

    const libraryDirectory = this.getLibraryDirectoryName(
      h5pJson.mainLibrary,
      h5pJson.preloadedDependencies
    );

    const libraryJsonText = await packageZip.file(`${libraryDirectory}/library.json`).async("text");
    const libraryJson: LibraryJson = JSON.parse(libraryJsonText);

    let semantics: any = null;
    const semanticsFile = packageZip.file(`${libraryDirectory}/semantics.json`);
    if (semanticsFile) {
      const semanticsText = await semanticsFile.async("text");
      semantics = JSON.parse(semanticsText);
    }

    const metadata: LibraryMetadata = {
      machineName: libraryJson.machineName,
      title: libraryJson.title,
      majorVersion: libraryJson.majorVersion,
      minorVersion: libraryJson.minorVersion,
      patchVersion: libraryJson.patchVersion,
      runnable: libraryJson.runnable,
      fullscreen: libraryJson.fullscreen,
      embedTypes: libraryJson.embedTypes,
      preloadedJs: libraryJson.preloadedJs,
      preloadedCss: libraryJson.preloadedCss,
      preloadedDependencies: libraryJson.preloadedDependencies,
      editorDependencies: libraryJson.editorDependencies,
      dynamicDependencies: libraryJson.dynamicDependencies,
      semantics: semantics,
      libraryDirectory: libraryDirectory
    };

    return metadata;
  }

  /**
   * Extracts a dependency library from a parent package.
   * Used when a library is bundled within another package but not available on Hub.
   * @param libraryName The machine name of the dependency library
   * @returns Library metadata extracted from parent package
   */
  private async extractDependencyLibraryFromParent(libraryName: string): Promise<LibraryMetadata> {
    const cacheEntries = Array.from(this.packageCache.entries());

    for (let i = 0; i < cacheEntries.length; i++) {
      const parentName = cacheEntries[i][0];
      const packageZip = cacheEntries[i][1];

      const directories = Object.keys(packageZip.files).filter(name =>
        name.startsWith(libraryName + "-") && name.includes("/library.json")
      );

      if (directories.length > 0) {
        const libraryDirectory = directories[0].replace("/library.json", "");
        const libraryJsonText = await packageZip.file(`${libraryDirectory}/library.json`).async("text");
        const libraryJson: LibraryJson = JSON.parse(libraryJsonText);

        let semantics: any = null;
        const semanticsFile = packageZip.file(`${libraryDirectory}/semantics.json`);
        if (semanticsFile) {
          const semanticsText = await semanticsFile.async("text");
          semantics = JSON.parse(semanticsText);
        }

        const metadata: LibraryMetadata = {
          machineName: libraryJson.machineName,
          title: libraryJson.title,
          majorVersion: libraryJson.majorVersion,
          minorVersion: libraryJson.minorVersion,
          patchVersion: libraryJson.patchVersion,
          runnable: libraryJson.runnable,
          fullscreen: libraryJson.fullscreen,
          embedTypes: libraryJson.embedTypes,
          preloadedJs: libraryJson.preloadedJs,
          preloadedCss: libraryJson.preloadedCss,
          preloadedDependencies: libraryJson.preloadedDependencies,
          editorDependencies: libraryJson.editorDependencies,
          dynamicDependencies: libraryJson.dynamicDependencies,
          semantics: semantics,
          libraryDirectory: libraryDirectory
        };

        this.registry.set(this.getLibraryKey(metadata), metadata);
        console.log(`Extracted dependency library ${libraryName} from ${parentName} package.`);

        return metadata;
      }
    }

    throw new Error(`Could not find library ${libraryName} in Hub or any cached parent packages`);
  }

  /**
   * Recursively resolves dependencies for a library.
   * Tracks visited libraries to handle circular dependencies.
   * @param libraryName The machine name of the library
   * @param allDependencies Map to accumulate all resolved dependencies
   */
  private async resolveDependenciesRecursive(
    libraryName: string,
    allDependencies: Map<string, LibraryMetadata>
  ): Promise<void> {
    if (this.resolutionInProgress.has(libraryName)) {
      return;
    }

    this.resolutionInProgress.add(libraryName);

    const metadata = await this.getLibrary(libraryName);
    const libraryKey = this.getLibraryKey(metadata);

    if (allDependencies.has(libraryKey)) {
      this.resolutionInProgress.delete(libraryName);
      return;
    }

    allDependencies.set(libraryKey, metadata);

    if (metadata.preloadedDependencies) {
      for (const dep of metadata.preloadedDependencies) {
        await this.resolveDependenciesRecursive(dep.machineName, allDependencies);
      }
    }

    if (metadata.editorDependencies) {
      for (const dep of metadata.editorDependencies) {
        await this.resolveDependenciesRecursive(dep.machineName, allDependencies);
      }
    }

    this.resolutionInProgress.delete(libraryName);
  }

  /**
   * Determines the library directory name from h5p.json metadata.
   * @param mainLibrary The main library name from h5p.json
   * @param preloadedDependencies The preloaded dependencies array
   * @returns Library directory name (e.g., "H5P.InteractiveBook-1.8")
   */
  private getLibraryDirectoryName(
    mainLibrary: string,
    preloadedDependencies: LibraryDependency[]
  ): string {
    const mainDep = preloadedDependencies.find(dep => dep.machineName === mainLibrary);
    if (mainDep) {
      return `${mainDep.machineName}-${mainDep.majorVersion}.${mainDep.minorVersion}`;
    }
    throw new Error(`Could not find main library ${mainLibrary} in preloadedDependencies`);
  }

  /**
   * Generates a unique key for a library based on name and version.
   * @param metadata Library metadata
   * @returns Unique library key
   */
  private getLibraryKey(metadata: LibraryMetadata): string {
    return `${metadata.machineName}-${metadata.majorVersion}.${metadata.minorVersion}`;
  }
}
