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

    // Generate and add h5p.json
    const h5pJson = this.generateH5pJson(content, dependencies, title, language);
    zip.file("h5p.json", JSON.stringify(h5pJson, null, 2));

    // Add content.json
    const contentJson = this.serializeContentJson(content);
    zip.file("content/content.json", contentJson);

    // Bundle all library directories
    await this.bundleLibraries(zip, dependencies, registry);

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
   * @param zip JSZip instance to add libraries to
   * @param dependencies All library dependencies
   * @param registry Library registry for accessing cached packages
   */
  public async bundleLibraries(
    zip: jszip,
    dependencies: LibraryMetadata[],
    registry: LibraryRegistry
  ): Promise<void> {
    // Get unique parent libraries (those that were downloaded as .h5p files)
    const parentLibraries = this.getParentLibraries(dependencies);

    for (const parentLib of parentLibraries) {
      const cachePath = path.join(this.cacheDir, `${parentLib}.h5p`);

      if (!(await fsExtra.pathExists(cachePath))) {
        console.warn(`Warning: Cached package not found for ${parentLib}`);
        continue;
      }

      // Load the cached package
      const packageBuffer = await fsExtra.readFile(cachePath);
      const packageZip = await jszip.loadAsync(packageBuffer);

      // Copy all library directories from this package
      await this.copyLibraryDirectories(zip, packageZip, dependencies);
    }
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
   * @param dependencies All library dependencies
   * @returns Array of parent library names
   */
  private getParentLibraries(dependencies: LibraryMetadata[]): string[] {
    const parentLibs = new Set<string>();

    // The main library and any that were downloaded directly
    // For now, we'll check which libraries have cached .h5p files
    for (const dep of dependencies) {
      // Main content types are typically downloaded directly
      // Dependencies might be bundled within parent packages
      if (dep.runnable === 1 || dep.machineName === "H5P.InteractiveBook") {
        parentLibs.add(dep.machineName);
      }
    }

    // Add common parent libraries that bundle dependencies
    parentLibs.add("H5P.InteractiveBook");

    return Array.from(parentLibs);
  }

  /**
   * Copies library directories from a source package to the destination package.
   * @param destZip Destination JSZip instance
   * @param sourceZip Source JSZip instance (cached package)
   * @param dependencies Libraries to include
   */
  private async copyLibraryDirectories(
    destZip: jszip,
    sourceZip: jszip,
    dependencies: LibraryMetadata[]
  ): Promise<void> {
    // Build set of library directory names we need
    const neededLibraries = new Set(
      dependencies.map(dep => `${dep.machineName}-${dep.majorVersion}.${dep.minorVersion}`)
    );

    // Iterate through all files in source package
    const files = Object.keys(sourceZip.files);

    for (const fileName of files) {
      // Check if this file belongs to a needed library directory
      const matchesLibrary = Array.from(neededLibraries).some(libDir => {
        return fileName.startsWith(`${libDir}/`);
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
  }
}
