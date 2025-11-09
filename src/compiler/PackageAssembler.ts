import * as jszip from "jszip";
import * as path from "path";
import * as fsExtra from "fs-extra";
import { BookContent, MediaFile } from "./ContentBuilder";
import { LibraryRegistry } from "./LibraryRegistry";
import { LibraryMetadata } from "./types";

/**
 * PackageAssembler builds complete .h5p ZIP packages from scratch without templates.
 * Generates h5p.json, bundles libraries, adds media files, and creates the final package structure.
 */
export class PackageAssembler {
  private cacheDir = path.resolve("content-type-cache");

  /**
   * Assembles a complete .h5p package from content, libraries, and media files.
   * @param content Book content structure from ContentBuilder
   * @param dependencies All required library metadata from LibraryRegistry
   * @param mediaFiles Media files to include (images, audio)
   * @param title Book title
   * @param language Language code
   * @param registry Library registry for accessing cached packages
   * @returns JSZip instance containing the complete package
   */
  public async assemble(
    content: BookContent,
    dependencies: LibraryMetadata[],
    mediaFiles: MediaFile[],
    title: string,
    language: string,
    registry: LibraryRegistry
  ): Promise<jszip> {
    const zip = new jszip();

    // Bundle all library directories (this also extracts layout libraries from InteractiveBook)
    const layoutLibraries = await this.bundleLibraries(zip, dependencies, registry);

    // Add layout libraries to dependencies for h5p.json
    const allDependencies = [...dependencies, ...layoutLibraries];

    // Generate and add h5p.json with ALL dependencies including layout libraries
    const h5pJson = this.generateH5pJson(content, allDependencies, title, language);
    zip.file("h5p.json", JSON.stringify(h5pJson, null, 2));

    // Add content.json
    const contentJson = this.serializeContentJson(content);
    zip.file("content/content.json", contentJson);

    // Add media files
    this.addMediaFiles(zip, mediaFiles);

    return zip;
  }

  /**
   * Generates h5p.json metadata file for the package.
   * @param content Book content structure
   * @param dependencies All library dependencies
   * @param title Book title
   * @param language Language code
   * @returns h5p.json object
   */
  public generateH5pJson(
    content: BookContent,
    dependencies: LibraryMetadata[],
    title: string,
    language: string
  ): any {
    // Build preloadedDependencies array
    const preloadedDependencies = dependencies.map(lib => ({
      machineName: lib.machineName,
      majorVersion: lib.majorVersion,
      minorVersion: lib.minorVersion
    }));

    return {
      title: title,
      language: language,
      mainLibrary: "H5P.InteractiveBook",
      embedTypes: ["div"],
      license: "U",
      preloadedDependencies: preloadedDependencies
    };
  }

  /**
   * Serializes content to JSON string.
   * @param content Book content structure
   * @returns JSON string representation
   */
  public serializeContentJson(content: BookContent): string {
    return JSON.stringify(content, null, 2);
  }

  /**
   * Bundles all required library directories into the package.
   * Copies library files from cached .h5p packages without using templates.
   * Also extracts layout libraries (Column, Row, RowColumn) from InteractiveBook.
   * @param zip JSZip instance to add libraries to
   * @param dependencies All library dependencies
   * @param registry Library registry for accessing cached packages
   * @returns Layout libraries that were extracted (to be added to h5p.json)
   */
  public async bundleLibraries(
    zip: jszip,
    dependencies: LibraryMetadata[],
    registry: LibraryRegistry
  ): Promise<LibraryMetadata[]> {
    // Get unique parent libraries (those that were downloaded as .h5p files)
    const parentLibraries = await this.getParentLibraries(dependencies);
    const extractedLayoutLibraries: LibraryMetadata[] = [];

    for (const parentLib of parentLibraries) {
      // Try to find versioned cache file first (e.g., H5P.Flashcards-1.5.h5p)
      // Use case-insensitive matching since H5P library names can vary in casing
      const cacheFiles = await fsExtra.readdir(this.cacheDir);
      const parentLibLower = parentLib.toLowerCase();
      const matchingFiles = cacheFiles.filter(file => {
        const fileLower = file.toLowerCase();
        return (
          (fileLower.startsWith(`${parentLibLower}-`) || fileLower === `${parentLibLower}.h5p`) &&
          file.endsWith('.h5p')
        );
      });

      if (matchingFiles.length === 0) {
        console.warn(`Warning: Cached package not found for ${parentLib}`);
        continue;
      }

      // Use the first matching file (versioned or non-versioned)
      const cacheFilename = matchingFiles[0];
      const cachePath = path.join(this.cacheDir, cacheFilename);

      // Load the cached package
      const packageBuffer = await fsExtra.readFile(cachePath);
      const packageZip = await jszip.loadAsync(packageBuffer);

      // Copy all library directories from this package
      const layoutLibs = await this.copyLibraryDirectories(zip, packageZip, dependencies);
      extractedLayoutLibraries.push(...layoutLibs);
    }

    return extractedLayoutLibraries;
  }

  /**
   * Adds media files (images, audio) to the package.
   * @param zip JSZip instance to add files to
   * @param mediaFiles Array of media files with filenames and buffers
   */
  public addMediaFiles(zip: jszip, mediaFiles: MediaFile[]): void {
    for (const mediaFile of mediaFiles) {
      zip.file(`content/${mediaFile.filename}`, mediaFile.buffer);
    }
  }

  /**
   * Saves the assembled package to disk.
   * Filters out empty directory entries that H5P.com doesn't allow.
   * @param zip JSZip instance containing the package
   * @param outputPath Path where to save the .h5p file
   */
  public async savePackage(zip: jszip, outputPath: string): Promise<void> {
    // Create a new zip without directory entries by adding files with { createFolders: false }
    const cleanZip = new jszip();

    // Copy only files (not directories) to the clean zip
    const files = Object.keys(zip.files);
    for (const fileName of files) {
      const file = zip.files[fileName];

      // Skip directory entries (H5P.com doesn't allow empty directories)
      if (file.dir) {
        continue;
      }

      // Copy file content to clean zip WITHOUT creating folder entries
      const content = await file.async("nodebuffer");
      cleanZip.file(fileName, content, { createFolders: false });
    }

    const buffer = await cleanZip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 9 }
    });

    await fsExtra.writeFile(outputPath, buffer);
    console.log(`Saved H5P package to ${outputPath}`);
  }

  /**
   * Identifies parent libraries that were downloaded as .h5p packages.
   * These are the top-level content types from the Hub.
   * Checks which dependencies have cached .h5p files (versioned or non-versioned).
   * @param dependencies All library dependencies
   * @returns Array of parent library names
   */
  private async getParentLibraries(dependencies: LibraryMetadata[]): Promise<string[]> {
    const parentLibs = new Set<string>();

    // Check cache directory for existing .h5p files
    const cacheFiles = await fsExtra.readdir(this.cacheDir);

    for (const dep of dependencies) {
      // Check if this library has a cached .h5p file (versioned or non-versioned)
      // Use case-insensitive matching since H5P library names can vary in casing
      const hasCache = cacheFiles.some(file => {
        const fileLower = file.toLowerCase();
        const depNameLower = dep.machineName.toLowerCase();
        return (
          (fileLower.startsWith(`${depNameLower}-`) || fileLower === `${depNameLower}.h5p`) &&
          file.endsWith('.h5p')
        );
      });

      if (hasCache) {
        parentLibs.add(dep.machineName);
      }
    }

    // Always include InteractiveBook as it's the main library
    parentLibs.add("H5P.InteractiveBook");

    return Array.from(parentLibs);
  }

  /**
   * Copies library directories from a source package to the destination package.
   *
   * IMPORTANT: Extracts libraries from dependencies list AND adds H5P.Column, Row, RowColumn
   * which are used by Interactive Book but not declared as dependencies.
   *
   * @param destZip Destination JSZip instance
   * @param sourceZip Source JSZip instance (cached package)
   * @param dependencies Libraries to include from the dependency tree
   * @returns Layout libraries that were found and extracted
   */
  private async copyLibraryDirectories(
    destZip: jszip,
    sourceZip: jszip,
    dependencies: LibraryMetadata[]
  ): Promise<LibraryMetadata[]> {
    // Build set of library directory names we need from dependencies
    const neededLibraries = new Set(
      dependencies.map(dep => `${dep.machineName}-${dep.majorVersion}.${dep.minorVersion}`)
    );

    // Add Interactive Book layout libraries explicitly
    // These are used by Interactive Book but not declared in dependency tree:
    // - H5P.Column: Used for chapter structure
    // - H5P.Row: Used for content rows within chapters
    // - H5P.RowColumn: Used for columns within rows
    const files = Object.keys(sourceZip.files);
    const layoutLibraries = ['H5P.Column', 'H5P.Row', 'H5P.RowColumn'];
    const extractedLayoutLibs: LibraryMetadata[] = [];

    for (const libName of layoutLibraries) {
      for (const fileName of files) {
        const match = fileName.match(new RegExp(`^(${libName}-(\\d+)\\.(\\d+))\\/`));
        if (match) {
          const fullLibName = match[1];  // e.g., "H5P.Column-1.18"
          const majorVersion = parseInt(match[2]);
          const minorVersion = parseInt(match[3]);

          neededLibraries.add(fullLibName);

          // Add to extracted list for h5p.json
          extractedLayoutLibs.push({
            machineName: libName,
            majorVersion,
            minorVersion,
            patchVersion: 0,  // Not critical for h5p.json
            title: libName.replace('H5P.', ''),
            runnable: 0
          });
          break;
        }
      }
    }

    // Copy all files from needed library directories
    for (const fileName of files) {
      // Check if this file belongs to a needed library directory (case-insensitive)
      const matchesLibrary = Array.from(neededLibraries).some(libDir => {
        return fileName.toLowerCase().startsWith(`${libDir.toLowerCase()}/`);
      });

      if (matchesLibrary) {
        const file = sourceZip.files[fileName];

        // Skip directories (they're created automatically)
        if (file.dir) {
          continue;
        }

        // Copy file to destination
        const content = await file.async("nodebuffer");
        destZip.file(fileName, content);
      }
    }

    return extractedLayoutLibs;
  }
}
