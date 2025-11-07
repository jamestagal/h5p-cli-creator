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
   * Fetches a library from the H5P Hub and extracts its metadata.
   * Downloads from Hub if not cached, otherwise uses local cache.
   * @param name The machine name of the library (e.g., "H5P.InteractiveBook")
   * @returns Library metadata including semantics
   */
  public async fetchLibrary(name: string): Promise<LibraryMetadata> {
    const localPath = path.join(this.cacheDir, `${name}.h5p`);
    let dataBuffer: Buffer;

    if (!(await fsExtra.pathExists(localPath))) {
      dataBuffer = toBuffer(await this.downloadLibraryFromHub(name));
      await fsExtra.ensureDir(this.cacheDir);
      await fsExtra.writeFile(localPath, dataBuffer);
      console.log(`Downloaded library package ${name} from H5P Hub.`);
    } else {
      dataBuffer = await fsExtra.readFile(localPath);
      console.log(`Using cached library package from ${localPath}`);
    }

    const metadata = await this.extractLibraryMetadata(name, dataBuffer);
    this.registry.set(this.getLibraryKey(metadata), metadata);

    return metadata;
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
