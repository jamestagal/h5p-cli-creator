import * as path from "path";
import * as jszip from "jszip";
import { PackageAssembler } from "../../src/compiler/PackageAssembler";
import { LibraryRegistry } from "../../src/compiler/LibraryRegistry";
import { ContentBuilder } from "../../src/compiler/ContentBuilder";
import { SemanticValidator } from "../../src/compiler/SemanticValidator";

describe("PackageAssembler", () => {
  let registry: LibraryRegistry;
  let validator: SemanticValidator;
  let assembler: PackageAssembler;

  beforeAll(async () => {
    registry = new LibraryRegistry();
    validator = new SemanticValidator();
    assembler = new PackageAssembler();

    // Fetch H5P.InteractiveBook and its dependencies
    await registry.resolveDependencies("H5P.InteractiveBook");
  }, 120000);

  describe("h5p.json Generation", () => {
    test("should generate h5p.json with correct structure", async () => {
      const builder = new ContentBuilder(registry, validator);
      builder.createBook("Test Biology Book", "en");

      const chapter = builder.addChapter("Chapter 1");
      chapter.addTextPage("Introduction", "Welcome to biology");

      const content = builder.build();
      const dependencies = await registry.resolveDependencies("H5P.InteractiveBook");

      const h5pJson = assembler.generateH5pJson(
        content,
        dependencies,
        builder.getTitle(),
        builder.getLanguage()
      );

      expect(h5pJson).toBeDefined();
      expect(h5pJson.title).toBe("Test Biology Book");
      expect(h5pJson.language).toBe("en");
      expect(h5pJson.mainLibrary).toBe("H5P.InteractiveBook");
      expect(h5pJson.embedTypes).toEqual(["div"]);
      expect(h5pJson.license).toBe("U");
    });

    test("should include all preloaded dependencies in h5p.json", async () => {
      const builder = new ContentBuilder(registry, validator);
      builder.createBook("Test Book", "en");

      const chapter = builder.addChapter("Chapter 1");
      chapter.addTextPage("Title", "Content");

      const content = builder.build();
      const dependencies = await registry.resolveDependencies("H5P.InteractiveBook");

      const h5pJson = assembler.generateH5pJson(
        content,
        dependencies,
        builder.getTitle(),
        builder.getLanguage()
      );

      expect(h5pJson.preloadedDependencies).toBeDefined();
      expect(Array.isArray(h5pJson.preloadedDependencies)).toBe(true);
      expect(h5pJson.preloadedDependencies.length).toBeGreaterThan(0);

      const depNames = h5pJson.preloadedDependencies.map((dep: any) => dep.machineName);
      expect(depNames).toContain("H5P.InteractiveBook");
      expect(depNames).toContain("FontAwesome");
      expect(depNames).toContain("H5P.JoubelUI");
    });
  });

  describe("Content.json Assembly", () => {
    test("should serialize content builder output to JSON", () => {
      const builder = new ContentBuilder(registry, validator);
      builder.createBook("Test Book", "en");

      const chapter = builder.addChapter("Chapter 1");
      chapter.addTextPage("Page Title", "Page content");

      const content = builder.build();
      const contentJson = assembler.serializeContentJson(content);

      expect(contentJson).toBeDefined();
      expect(typeof contentJson).toBe("string");

      const parsed = JSON.parse(contentJson);
      expect(parsed.bookCover).toBeDefined();
      expect(parsed.chapters).toBeDefined();
      expect(Array.isArray(parsed.chapters)).toBe(true);
    });
  });

  describe("Library Bundling", () => {
    test("should bundle library directories from cache without templates", async () => {
      const dependencies = await registry.resolveDependencies("H5P.InteractiveBook");
      const zip = new jszip();

      await assembler.bundleLibraries(zip, dependencies, registry);

      // Check that library directories are included
      const files = Object.keys(zip.files);

      // Should have H5P.InteractiveBook library files
      const interactiveBookFiles = files.filter(f => f.startsWith("H5P.InteractiveBook-"));
      expect(interactiveBookFiles.length).toBeGreaterThan(0);

      // Should have library.json
      const libraryJsonFiles = files.filter(f => f.includes("library.json"));
      expect(libraryJsonFiles.length).toBeGreaterThan(0);
    });

    test("should preserve library directory structure", async () => {
      const dependencies = await registry.resolveDependencies("H5P.InteractiveBook");
      const zip = new jszip();

      await assembler.bundleLibraries(zip, dependencies, registry);

      const files = Object.keys(zip.files);

      // Should have proper directory structure (e.g., H5P.InteractiveBook-1.8/library.json)
      const hasProperStructure = files.some(f => {
        return /^H5P\.\w+-\d+\.\d+\/library\.json$/.test(f);
      });

      expect(hasProperStructure).toBe(true);
    });
  });

  describe("Media File Assembly", () => {
    test("should add image files to content/images/ directory", async () => {
      const builder = new ContentBuilder(registry, validator);
      builder.createBook("Test Book", "en");

      const testImagePath = path.join(__dirname, "../test-image.jpg");
      const chapter = builder.addChapter("Chapter 1");
      await chapter.addImagePage("Test Image", testImagePath, "Alt text");

      const mediaFiles = builder.getMediaFiles();
      const zip = new jszip();

      assembler.addMediaFiles(zip, mediaFiles);

      const files = Object.keys(zip.files);
      const imageFiles = files.filter(f => f.startsWith("content/images/"));

      expect(imageFiles.length).toBeGreaterThan(0);
      expect(imageFiles.some(f => /content\/images\/\d+\.\w+/.test(f))).toBe(true);
    });

    test("should add audio files to content/audios/ directory", async () => {
      const builder = new ContentBuilder(registry, validator);
      builder.createBook("Test Book", "en");

      const testAudioPath = path.join(__dirname, "../test-audio.mp3");
      const chapter = builder.addChapter("Chapter 1");
      await chapter.addAudioPage("Test Audio", testAudioPath);

      const mediaFiles = builder.getMediaFiles();
      const zip = new jszip();

      assembler.addMediaFiles(zip, mediaFiles);

      const files = Object.keys(zip.files);
      const audioFiles = files.filter(f => f.startsWith("content/audios/"));

      expect(audioFiles.length).toBeGreaterThan(0);
      expect(audioFiles.some(f => /content\/audios\/\d+\.\w+/.test(f))).toBe(true);
    });
  });

  describe("Complete Package Assembly", () => {
    test("should assemble complete .h5p package without templates", async () => {
      const builder = new ContentBuilder(registry, validator);
      builder.createBook("Complete Test Book", "en");

      const chapter1 = builder.addChapter("Introduction");
      chapter1.addTextPage("Welcome", "This is a test book");

      const chapter2 = builder.addChapter("Visual Content");
      const testImagePath = path.join(__dirname, "../test-image.jpg");
      await chapter2.addImagePage("Test Image", testImagePath, "A test image");

      const content = builder.build();
      const dependencies = await registry.resolveDependencies("H5P.InteractiveBook");

      const zip = await assembler.assemble(
        content,
        dependencies,
        builder.getMediaFiles(),
        builder.getTitle(),
        builder.getLanguage(),
        registry
      );

      expect(zip).toBeDefined();

      // Verify package structure
      const files = Object.keys(zip.files);

      // Should have h5p.json
      expect(files).toContain("h5p.json");

      // Should have content/content.json
      expect(files).toContain("content/content.json");

      // Should have library directories
      const hasLibraries = files.some(f => f.includes("library.json"));
      expect(hasLibraries).toBe(true);

      // Should have media files if applicable
      const hasImages = files.some(f => f.startsWith("content/images/"));
      expect(hasImages).toBe(true);
    });

    test("should generate valid ZIP structure matching H5P specification", async () => {
      const builder = new ContentBuilder(registry, validator);
      builder.createBook("Spec Test Book", "en");

      const chapter = builder.addChapter("Chapter 1");
      chapter.addTextPage("Title", "Content");

      const content = builder.build();
      const dependencies = await registry.resolveDependencies("H5P.InteractiveBook");

      const zip = await assembler.assemble(
        content,
        dependencies,
        builder.getMediaFiles(),
        builder.getTitle(),
        builder.getLanguage(),
        registry
      );

      // Extract and validate h5p.json
      const h5pJsonFile = zip.file("h5p.json");
      expect(h5pJsonFile).not.toBeNull();

      const h5pJsonText = await h5pJsonFile.async("text");
      const h5pJson = JSON.parse(h5pJsonText);

      expect(h5pJson.title).toBe("Spec Test Book");
      expect(h5pJson.mainLibrary).toBe("H5P.InteractiveBook");
      expect(h5pJson.preloadedDependencies).toBeDefined();

      // Extract and validate content.json
      const contentJsonFile = zip.file("content/content.json");
      expect(contentJsonFile).not.toBeNull();

      const contentJsonText = await contentJsonFile.async("text");
      const contentJson = JSON.parse(contentJsonText);

      expect(contentJson.bookCover).toBeDefined();
      expect(contentJson.chapters).toBeDefined();
      expect(contentJson.chapters.length).toBeGreaterThan(0);
    });
  });
});
