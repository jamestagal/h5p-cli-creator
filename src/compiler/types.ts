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
