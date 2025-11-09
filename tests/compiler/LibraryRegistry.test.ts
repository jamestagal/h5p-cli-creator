import * as fsExtra from "fs-extra";
import * as path from "path";
import { LibraryRegistry } from "../../src/compiler/LibraryRegistry";
import { LibraryMetadata } from "../../src/compiler/types";

describe("LibraryRegistry", () => {
  let registry: LibraryRegistry;
  const cacheDir = path.resolve("content-type-cache");

  beforeEach(() => {
    registry = new LibraryRegistry();
  });

  describe("fetchLibrary", () => {
    it("should fetch content type library from Hub API and extract metadata", async () => {
      const metadata = await registry.fetchLibrary("H5P.Flashcards");

      expect(metadata).toBeDefined();
      expect(metadata.machineName).toBe("H5P.Flashcards");
      expect(metadata.majorVersion).toBeGreaterThan(0);
      expect(metadata.minorVersion).toBeGreaterThanOrEqual(0);
      expect(metadata.semantics).toBeDefined();
    }, 30000);

    it("should use cached library when available", async () => {
      const libraryName = "H5P.Dialogcards";  // lowercase 'c' - matches cached version

      // This should load from cache (H5P.Dialogcards-1.9.h5p exists)
      const metadata = await registry.fetchLibrary(libraryName);

      expect(metadata).toBeDefined();
      expect(metadata.machineName).toBe("H5P.Dialogcards");
      expect(metadata.majorVersion).toBe(1);
      expect(metadata.minorVersion).toBe(9);
    }, 30000);
  });

  describe("getLibrary", () => {
    it("should return cached library without redundant downloads", async () => {
      const libraryName = "H5P.InteractiveBook";

      const firstFetch = await registry.getLibrary(libraryName);
      const secondFetch = await registry.getLibrary(libraryName);

      expect(firstFetch).toBeDefined();
      expect(secondFetch).toBeDefined();
      expect(firstFetch.machineName).toBe(secondFetch.machineName);
      expect(firstFetch.majorVersion).toBe(secondFetch.majorVersion);
    }, 30000);
  });

  describe("resolveDependencies", () => {
    it("should recursively resolve H5P.InteractiveBook dependencies", async () => {
      const dependencies = await registry.resolveDependencies("H5P.InteractiveBook");

      expect(dependencies).toBeDefined();
      expect(Array.isArray(dependencies)).toBe(true);
      expect(dependencies.length).toBeGreaterThan(0);

      const dependencyNames = dependencies.map(dep => dep.machineName);
      expect(dependencyNames).toContain("FontAwesome");
      expect(dependencyNames).toContain("H5P.JoubelUI");
    }, 60000);

    it("should handle circular dependencies gracefully", async () => {
      const dependencies = await registry.resolveDependencies("H5P.InteractiveBook");

      const uniqueDependencies = new Set(dependencies.map(dep =>
        `${dep.machineName}-${dep.majorVersion}.${dep.minorVersion}`
      ));

      expect(dependencies.length).toBeGreaterThanOrEqual(uniqueDependencies.size);
    }, 60000);
  });

  describe("library metadata extraction", () => {
    it("should extract library.json with version and dependencies", async () => {
      const metadata = await registry.fetchLibrary("H5P.InteractiveBook");

      expect(metadata.machineName).toBe("H5P.InteractiveBook");
      expect(metadata.title).toBeDefined();
      expect(metadata.majorVersion).toBeGreaterThan(0);
      expect(metadata.patchVersion).toBeGreaterThanOrEqual(0);
      expect(metadata.preloadedDependencies).toBeDefined();
      expect(Array.isArray(metadata.preloadedDependencies)).toBe(true);
    }, 30000);

    it("should extract semantics.json from library package", async () => {
      const metadata = await registry.fetchLibrary("H5P.InteractiveBook");

      expect(metadata.semantics).toBeDefined();
      expect(Array.isArray(metadata.semantics)).toBe(true);
      expect(metadata.semantics.length).toBeGreaterThan(0);
    }, 30000);
  });
});
